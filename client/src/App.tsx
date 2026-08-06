import { Navigate, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import GroupRoomsPage from "./pages/GroupRoomsPage";
import GroupWorkoutPage from "./pages/GroupWorkoutPage";
import ThreadPage from "./pages/ThreadPage";
import FriendProfilePage from "./pages/FriendProfilePage";
import AdminPage from "./pages/AdminPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<HomePage />} />
      {/* Declared before /group/:sessionId so the literal wins, matching the
          route-order dependency the Express router already relies on. */}
      <Route path="/group/rooms" element={<GroupRoomsPage />} />
      <Route path="/group/:sessionId" element={<GroupWorkoutPage />} />
      <Route path="/social/post/:postId" element={<ThreadPage />} />
      <Route path="/user/:userId" element={<FriendProfilePage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
