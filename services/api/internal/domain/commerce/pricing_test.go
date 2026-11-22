package commerce

import "testing"

func TestFormatOrderNumberUsesDealoPrefix(t *testing.T) {
	if got := FormatOrderNumber(2026, 123); got != "DL-2026-000123" {
		t.Fatalf("FormatOrderNumber(2026, 123) = %q, want DL-2026-000123", got)
	}
}
