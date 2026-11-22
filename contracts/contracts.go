// Package contracts embeds the JSON Schemas shared by every Kaya service. Sample payloads live in
// the samples subpackage, which only tests import.
package contracts

import "embed"

// Schemas holds schemas/v1/*.schema.json.
//
//go:embed schemas
var Schemas embed.FS
