-- migrate:up
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

CREATE TABLE contacts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lid text UNIQUE CHECK (lid ~ '^[0-9]+@(lid|hosted\.lid)$'),
  pn text UNIQUE CHECK (pn ~ '^[0-9]+@(s\.whatsapp\.net|hosted)$'),
  bot text UNIQUE CHECK (bot ~ '^[0-9]+@bot$'),
  saved_name text,
  first_name text,
  push_name text,
  business_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(lid, pn, bot) > 0)
);

COMMENT ON TABLE contacts IS 'One row per person or bot, however WhatsApp addresses them. Write through contact_id_for(), which merges rows once a LID and a phone number are known to be the same person.';
COMMENT ON COLUMN contacts.lid IS 'LID JID without a device part';
COMMENT ON COLUMN contacts.pn IS 'Phone-number JID without a device part';
COMMENT ON COLUMN contacts.saved_name IS 'Name in DJ''s address book';
COMMENT ON COLUMN contacts.push_name IS 'Name the contact set for themselves';

CREATE TRIGGER contacts_set_updated_at BEFORE UPDATE ON contacts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE chats (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('direct', 'group', 'broadcast', 'newsletter')),
  contact_id bigint UNIQUE REFERENCES contacts (id),
  jid text UNIQUE,
  name text,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'direct') = (contact_id IS NOT NULL)),
  CHECK ((kind = 'direct') = (jid IS NULL)),
  CHECK (
    CASE kind
      WHEN 'group' THEN jid ~ '^[0-9]+(-[0-9]+)?@g\.us$'
      WHEN 'broadcast' THEN jid ~ '^([0-9]+|status)@broadcast$'
      WHEN 'newsletter' THEN jid ~ '^[0-9]+@newsletter$'
      ELSE true
    END
  )
);

COMMENT ON TABLE chats IS 'A direct chat is identified by its contact, so the LID and phone-number spellings of one DM are the same chat. Other kinds are identified by their JID.';
COMMENT ON COLUMN chats.name IS 'Group, broadcast list or channel name; empty for direct chats, whose name comes from contacts';

CREATE TRIGGER chats_set_updated_at BEFORE UPDATE ON chats
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chat_id bigint NOT NULL REFERENCES chats (id) ON DELETE CASCADE,
  wa_id text NOT NULL CHECK (wa_id ~ '^[[:alnum:]._-]{1,128}$'),
  sender_id bigint NOT NULL REFERENCES contacts (id),
  from_me boolean NOT NULL,
  sent_at timestamptz NOT NULL,
  kind text NOT NULL CHECK (
    kind IN (
      'text', 'image', 'video', 'audio', 'voice', 'document', 'sticker', 'location', 'contact',
      'poll', 'other'
    )
  ),
  body text,
  reply_to_wa_id text CHECK (reply_to_wa_id ~ '^[[:alnum:]._-]{1,128}$'),
  reply_to_sender_id bigint REFERENCES contacts (id),
  source text NOT NULL CHECK (source IN ('live', 'history')),
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chat_id, wa_id, sender_id),
  CHECK ((reply_to_wa_id IS NULL) = (reply_to_sender_id IS NULL))
);

COMMENT ON TABLE messages IS 'One row per message. Edits and revokes update the row they point at (body, edited_at, deleted_at) and are not stored as rows of their own. Reactions live in reactions.';
COMMENT ON COLUMN messages.wa_id IS 'WhatsApp message id; unique together with chat and sender';
COMMENT ON COLUMN messages.body IS 'Text, or the caption of a media message; null once revoked';
COMMENT ON COLUMN messages.source IS 'live: received while connected; history: from the history sync';

CREATE INDEX messages_chat_sent_at_idx ON messages (chat_id, sent_at DESC);

CREATE TRIGGER messages_set_updated_at BEFORE UPDATE ON messages
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE reactions (
  chat_id bigint NOT NULL REFERENCES chats (id) ON DELETE CASCADE,
  target_wa_id text NOT NULL CHECK (target_wa_id ~ '^[[:alnum:]._-]{1,128}$'),
  target_sender_id bigint NOT NULL REFERENCES contacts (id),
  sender_id bigint NOT NULL REFERENCES contacts (id),
  emoji text NOT NULL CHECK (emoji <> ''),
  reacted_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, target_wa_id, target_sender_id, sender_id)
);

COMMENT ON TABLE reactions IS 'The current reaction of each sender to a message. Removing a reaction deletes the row. No foreign key to messages, because a reaction can arrive before the message it targets.';

CREATE TRIGGER reactions_set_updated_at BEFORE UPDATE ON reactions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION merge_contacts(keep bigint, gone bigint) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  gone_row contacts;
  keep_row contacts;
  keep_chat bigint;
  gone_chat bigint;
BEGIN
  IF keep = gone THEN
    RETURN;
  END IF;
  SELECT * INTO STRICT gone_row FROM contacts WHERE id = gone FOR UPDATE;
  SELECT * INTO STRICT keep_row FROM contacts WHERE id = keep FOR UPDATE;
  IF keep_row.lid <> gone_row.lid OR keep_row.bot <> gone_row.bot THEN
    RAISE EXCEPTION 'contacts % and % have different addresses and are not the same person', keep, gone
      USING ERRCODE = 'unique_violation';
  END IF;

  SELECT id INTO keep_chat FROM chats WHERE contact_id = keep;
  SELECT id INTO gone_chat FROM chats WHERE contact_id = gone;
  IF gone_chat IS NOT NULL AND keep_chat IS NULL THEN
    UPDATE chats SET contact_id = keep WHERE id = gone_chat;
    keep_chat := gone_chat;
    gone_chat := NULL;
  END IF;

  CREATE TEMP TABLE merged_messages ON COMMIT DROP AS
  SELECT id, body, edited_at, deleted_at,
    first_value(id) OVER w AS survivor,
    count(*) OVER w AS copies
  FROM messages
  WHERE sender_id IN (keep, gone) OR chat_id IN (keep_chat, gone_chat)
  WINDOW w AS (
    PARTITION BY
      CASE WHEN chat_id = gone_chat THEN keep_chat ELSE chat_id END,
      wa_id,
      CASE WHEN sender_id = gone THEN keep ELSE sender_id END
    ORDER BY (sender_id <> gone AND chat_id IS DISTINCT FROM gone_chat) DESC, id
  );
  UPDATE messages m SET
    deleted_at = f.deleted_at,
    edited_at = f.edited_at,
    body = CASE WHEN f.deleted_at IS NULL THEN f.body END
  FROM (
    SELECT survivor,
      max(deleted_at) AS deleted_at,
      max(edited_at) AS edited_at,
      (array_agg(body ORDER BY edited_at DESC NULLS LAST, id = survivor DESC))[1] AS body
    FROM merged_messages
    WHERE copies > 1
    GROUP BY survivor
  ) f
  WHERE m.id = f.survivor;
  DELETE FROM messages WHERE id IN (SELECT id FROM merged_messages WHERE id <> survivor);
  DROP TABLE merged_messages;
  UPDATE messages SET
    chat_id = CASE WHEN chat_id = gone_chat THEN keep_chat ELSE chat_id END,
    sender_id = CASE WHEN sender_id = gone THEN keep ELSE sender_id END
  WHERE sender_id = gone OR chat_id = gone_chat;
  UPDATE messages SET reply_to_sender_id = keep WHERE reply_to_sender_id = gone;

  CREATE TEMP TABLE merged_reactions ON COMMIT DROP AS
  SELECT DISTINCT ON (chat_id, target_wa_id, target_sender_id, sender_id)
    chat_id, target_wa_id, target_sender_id, sender_id, emoji, reacted_at
  FROM (
    SELECT
      CASE WHEN chat_id = gone_chat THEN keep_chat ELSE chat_id END AS chat_id,
      target_wa_id,
      CASE WHEN target_sender_id = gone THEN keep ELSE target_sender_id END AS target_sender_id,
      CASE WHEN sender_id = gone THEN keep ELSE sender_id END AS sender_id,
      emoji,
      reacted_at
    FROM reactions
    WHERE chat_id = gone_chat OR target_sender_id = gone OR sender_id = gone
       OR chat_id = keep_chat OR target_sender_id = keep OR sender_id = keep
  ) r
  ORDER BY chat_id, target_wa_id, target_sender_id, sender_id, reacted_at DESC;
  DELETE FROM reactions
  WHERE chat_id = gone_chat OR target_sender_id = gone OR sender_id = gone
     OR chat_id = keep_chat OR target_sender_id = keep OR sender_id = keep;
  INSERT INTO reactions (chat_id, target_wa_id, target_sender_id, sender_id, emoji, reacted_at)
  SELECT chat_id, target_wa_id, target_sender_id, sender_id, emoji, reacted_at
  FROM merged_reactions;
  DROP TABLE merged_reactions;

  IF gone_chat IS NOT NULL THEN
    UPDATE chats k
    SET last_message_at = GREATEST(k.last_message_at, o.last_message_at)
    FROM chats o
    WHERE k.id = keep_chat AND o.id = gone_chat;
    DELETE FROM chats WHERE id = gone_chat;
  END IF;

  DELETE FROM contacts WHERE id = gone;
  UPDATE contacts SET
    lid = COALESCE(lid, gone_row.lid),
    pn = COALESCE(pn, gone_row.pn),
    bot = COALESCE(bot, gone_row.bot),
    saved_name = COALESCE(saved_name, gone_row.saved_name),
    first_name = COALESCE(first_name, gone_row.first_name),
    push_name = COALESCE(push_name, gone_row.push_name),
    business_name = COALESCE(business_name, gone_row.business_name)
  WHERE id = keep;
END
$$;

COMMENT ON FUNCTION merge_contacts(bigint, bigint) IS 'Folds contact gone into keep: their direct chats, messages and reactions become one, and gone is deleted. Duplicate copies of a message collapse into one row that keeps any revoke and the latest edit. Refuses two different LIDs or bots; the caller sets the current phone number.';

CREATE FUNCTION contact_id_for(p_lid text, p_pn text, p_bot text DEFAULT NULL) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE
  keep bigint;
  found_row contacts;
BEGIN
  IF num_nonnulls(p_lid, p_pn, p_bot) = 0 THEN
    RAISE EXCEPTION 'contact_id_for needs a LID, a phone-number JID or a bot JID'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('kaya.contacts'));

  IF p_lid IS NOT NULL THEN
    SELECT id INTO keep FROM contacts WHERE lid = p_lid;
  END IF;

  IF p_pn IS NOT NULL THEN
    SELECT * INTO found_row FROM contacts WHERE pn = p_pn;
    IF FOUND AND found_row.id IS DISTINCT FROM keep THEN
      IF p_lid IS NOT NULL AND found_row.lid IS NOT NULL THEN
        UPDATE contacts SET pn = NULL WHERE id = found_row.id;
      ELSIF keep IS NULL THEN
        keep := found_row.id;
      ELSE
        PERFORM merge_contacts(LEAST(keep, found_row.id), GREATEST(keep, found_row.id));
        keep := LEAST(keep, found_row.id);
      END IF;
    END IF;
  END IF;

  IF p_bot IS NOT NULL THEN
    SELECT * INTO found_row FROM contacts WHERE bot = p_bot;
    IF FOUND AND found_row.id IS DISTINCT FROM keep THEN
      IF keep IS NULL THEN
        keep := found_row.id;
      ELSE
        PERFORM merge_contacts(LEAST(keep, found_row.id), GREATEST(keep, found_row.id));
        keep := LEAST(keep, found_row.id);
      END IF;
    END IF;
  END IF;

  IF keep IS NULL THEN
    INSERT INTO contacts (lid, pn, bot) VALUES (p_lid, p_pn, p_bot) RETURNING id INTO keep;
    RETURN keep;
  END IF;

  UPDATE contacts SET
    lid = COALESCE(lid, p_lid),
    pn = COALESCE(p_pn, pn),
    bot = COALESCE(bot, p_bot)
  WHERE id = keep;
  RETURN keep;
END
$$;

COMMENT ON FUNCTION contact_id_for(text, text, text) IS 'The contact for whatever addresses are known (pass device-less JIDs). The LID is the account and the phone number can move: a number seen with a new LID leaves its previous account, a known LID seen with a new number takes it. Rows with no LID are merged into the account they turn out to be.';

-- migrate:down
DROP FUNCTION contact_id_for(text, text, text);
DROP FUNCTION merge_contacts(bigint, bigint);
DROP TABLE reactions;
DROP TABLE messages;
DROP TABLE chats;
DROP TABLE contacts;
DROP FUNCTION set_updated_at();
