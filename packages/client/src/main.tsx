import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { NavBar } from './components/NavBar.tsx';
import { Toast } from './components/Toast.tsx';
import { AuthPage } from './pages/Auth.tsx';
import { LeaderboardPage } from './pages/Leaderboard.tsx';
import { LobbyPage } from './pages/Lobby.tsx';
import { ProfilePage } from './pages/Profile.tsx';
import { JoinByCode, RoomPage } from './pages/Room.tsx';
import { useAuth } from './store/auth.ts';
import { useGame } from './store/game.ts';

function App() {
  const { me, loading, load } = useAuth();
  const connect = useGame((s) => s.connect);
  const disconnect = useGame((s) => s.disconnect);
  const loggedIn = !!me;

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (loggedIn) connect();
    else disconnect();
  }, [loggedIn, connect, disconnect]);

  if (loading) return <div className="grid min-h-screen place-items-center text-cream/50">Shuffling…</div>;
  if (!me)
    return (
      <>
        <AuthPage />
        <Toast />
      </>
    );

  return (
    <>
      <NavBar />
      <main>
        <Routes>
          <Route path="/" element={<LobbyPage />} />
          <Route path="/room/:id" element={<RoomPage />} />
          <Route path="/join/:code" element={<JoinByCode />} />
          <Route path="/u/:username" element={<ProfilePage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Toast />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
