// Royal Loyalty POS — Smart Grid tile. Opens the modal where staff can look up
// a customer balance, award points, and redeem a reward in-store.
import React from "react";
import { Tile, reactExtension, useApi } from "@shopify/ui-extensions-react/point-of-sale";

const TileComponent = () => {
  const api = useApi();
  return (
    <Tile
      title="Royal Loyalty"
      subtitle="Balance · earn · redeem"
      onPress={() => api.action.presentModal()}
      enabled
    />
  );
};

export default reactExtension("pos.home.tile.render", () => <TileComponent />);
