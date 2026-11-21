package ledger

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// moneyName matches identifiers that hold money. Ratios (rates, percents, ratings, coordinates) are
// allowed to be floats; amounts never are (money is int64 tiyin, UZS only).
var moneyName = regexp.MustCompile(`(?i)(price|amount|total|subtotal|commission|payable|payout|gross|balance|refund|tiyin|som)$`)

// TestMoneyIsNeverAFloat scans every hand-written Go file of the API for a struct field, variable,
// parameter or result whose name says money and whose type is a float.
func TestMoneyIsNeverAFloat(t *testing.T) {
	root := filepath.Join("..", "..")
	fset := token.NewFileSet()
	var violations []string
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			if name := entry.Name(); name == "gen" || name == "sqlc" {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		file, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			return err
		}
		check := func(names []*ast.Ident, typ ast.Expr) {
			ident, ok := typ.(*ast.Ident)
			if !ok || (ident.Name != "float64" && ident.Name != "float32") {
				return
			}
			for _, name := range names {
				if moneyName.MatchString(name.Name) {
					violations = append(violations, fset.Position(name.Pos()).String()+" "+name.Name+" "+ident.Name)
				}
			}
		}
		ast.Inspect(file, func(node ast.Node) bool {
			switch n := node.(type) {
			case *ast.Field:
				check(n.Names, n.Type)
			case *ast.ValueSpec:
				if n.Type != nil {
					check(n.Names, n.Type)
				}
			}
			return true
		})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, violation := range violations {
		t.Errorf("money must be int64 tiyin, found float: %s", violation)
	}
}
