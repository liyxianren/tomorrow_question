import { createBrowserRouter } from "react-router-dom";

import { AppShell } from "../app/AppShell";
import { DecisionCardDemoPage } from "../pages/DecisionCardDemoPage";
import { GamePage } from "../pages/GamePage";
import { HomePage } from "../pages/HomePage";
import { LobbyPage } from "../pages/LobbyPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { RoomPage } from "../pages/RoomPage";
import { SettlementPage } from "../pages/SettlementPage";


export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: "lobby",
        element: <LobbyPage />,
      },
      {
        path: "room/:roomCode",
        element: <RoomPage />,
      },
      {
        path: "game/:gameId",
        element: <GamePage />,
      },
      {
        path: "settlement/:gameId",
        element: <SettlementPage />,
      },
      {
        path: "design/decision-card-demo",
        element: <DecisionCardDemoPage />,
      },
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
]);
