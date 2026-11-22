package httpapi

import (
	"testing"

	"github.com/google/uuid"

	"github.com/dealo/dealo/services/api/internal/http/gen"
)

// A deal photo names its source; the address and size are never taken from the request.
func TestDealInputMapsPhotoSources(t *testing.T) {
	asset, photo := uuid.New(), uuid.New()
	in := dealInput(gen.DealInput{Media: []gen.DealMediaInput{
		{MediaAssetId: &asset, SortOrder: 0},
		{Id: &photo, SortOrder: 1},
	}})
	if len(in.Media) != 2 {
		t.Fatalf("media = %d, want 2", len(in.Media))
	}
	if in.Media[0].AssetID == nil || *in.Media[0].AssetID != asset || in.Media[0].ID != nil {
		t.Fatalf("library photo = %+v", in.Media[0])
	}
	if in.Media[1].ID == nil || *in.Media[1].ID != photo || in.Media[1].AssetID != nil || in.Media[1].SortOrder != 1 {
		t.Fatalf("kept photo = %+v", in.Media[1])
	}
	if in.Media[0].URL != "" || in.Media[0].Width != 0 {
		t.Fatal("the request must not set the photo address or size")
	}
}
