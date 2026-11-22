// Package samples embeds the sample payloads that every side's contract tests check. Only tests
// import it, so invalid payloads never ship in a service binary.
package samples

import "embed"

// V1 holds v1/<schema>/{valid,invalid}/*.json.
//
//go:embed v1
var V1 embed.FS
