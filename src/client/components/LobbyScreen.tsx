import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Link2,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { SECTORS } from '../../shared/sectors';
import { COOP_SECTORS } from '../../shared/coop';
import { MatchState } from '../../shared/types';

interface LobbyScreenProps {
  matchState: MatchState;
  playerToken: string;
  onToggleReady: (ready: boolean) => void;
  onChangeDuration: (duration: 45 | 90) => void;
  onLeaveLobby: () => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  matchState,
  playerToken,
  onToggleReady,
  onChangeDuration,
  onLeaveLobby,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copyError, setCopyError] = useState('');
  const race = matchState.mode === 'RACE';
  const coop = matchState.mode === 'COOP';

  const me = matchState.players.find((p) => p.token === playerToken);
  const isHost = matchState.hostToken === playerToken;

  const inviteUrl = `${window.location.origin}/?room=${matchState.roomCode}`;

  const copy = async (text: string, link: boolean) => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setCopyError('');
      if (link) setCopiedLink(true); else setCopiedCode(true);
      setTimeout(() => { setCopiedLink(false); setCopiedCode(false); }, 2000);
    } catch { setCopyError('Copy is unavailable here. Select the invite link or room code below.'); }
  };
  const handleCopyCode = () => { void copy(matchState.roomCode, false); };
  const handleCopyLink = () => { void copy(inviteUrl, true); };

  return (
    <div className="game-screen lobby-screen max-w-5xl mx-auto px-4 py-8">
      <div className="cyber-card lobby-room rounded-2xl p-6 sm:p-8 border border-cyan-500/35">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-cyan-400">
              {coop ? 'CO-OP EXPEDITION LOBBY' : race ? 'LIVE ESCAPE RACE LOBBY' : 'MULTIPLAYER ARENA LOBBY'}
            </span>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white mt-1">
              {coop ? 'Coordinate your escape.' : race ? 'Ready for the orbital run?' : 'Prepare your next mind game.'}
            </h2>
          </div>

          {/* Room Code Display */}
          <div className="flex items-center gap-2">
            <div className="px-4 py-2 rounded-xl bg-slate-950 border border-cyan-400/50 text-center">
              <div className="text-[10px] font-mono text-slate-400 uppercase">
                ROOM CODE
              </div>
              <div
                data-testid="lobby-room-code"
                className="font-mono font-black text-2xl tracking-widest text-cyan-300"
              >
                {matchState.roomCode}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={handleCopyCode}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-mono text-slate-200 flex items-center gap-1.5 transition"
              >
                {copiedCode ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-cyan-400" />
                )}
                <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyLink}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-mono text-slate-200 flex items-center gap-1.5 transition"
              >
                {copiedLink ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Link2 className="w-3.5 h-3.5 text-purple-400" />
                )}
                <span>{copiedLink ? 'Link Copied' : 'Invite Link'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5"><label className="text-xs text-slate-400 block">Invite a friend on another device<input aria-label="Shareable invite URL" readOnly value={inviteUrl} onFocus={event => event.target.select()} className="mt-2 w-full p-3 rounded-lg bg-slate-950 border border-slate-700 text-cyan-200 font-mono text-xs" /></label>{copyError && <p role="status" className="architect-message">{copyError}</p>}</div>
        {race && <p className="mt-4 text-sm text-slate-300 leading-relaxed">Both players start together and race through {SECTORS.length} orbital sectors. See your rival live, use lifts and access cores, and reach the final exit first. Each exit is a checkpoint.</p>}
        {coop && <p className="mt-4 text-sm text-slate-300 leading-relaxed">Work together through {COOP_SECTORS.length} team missions. Hold the pressure switch for your teammate, collect shared access cores and both reach extraction to advance. The server verifies every move.</p>}
        {/* Match Timer Configuration */}
        {!race && !coop && <div className="my-6 flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-cyan-400" />
            <div>
              <div className="text-xs font-display font-bold text-white">
                BUILD PHASE COUNTDOWN
              </div>
              <div className="text-xs text-slate-400">
                Both players receive 30 budget points and identical tile limits.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!isHost}
              onClick={() => onChangeDuration(45)}
              className={`px-3.5 py-1.5 rounded-lg font-mono text-xs border transition ${
                matchState.buildDurationSec === 45
                  ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 font-bold'
                  : 'bg-slate-950 border-slate-700 text-slate-400'
              } ${!isHost ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              45s Demo
            </button>
            <button
              type="button"
              disabled={!isHost}
              onClick={() => onChangeDuration(90)}
              className={`px-3.5 py-1.5 rounded-lg font-mono text-xs border transition ${
                matchState.buildDurationSec === 90
                  ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 font-bold'
                  : 'bg-slate-950 border-slate-700 text-slate-400'
              } ${!isHost ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              90s Standard
            </button>
          </div>
        </div>

        }
        {/* Two Player Slots */}
        <div className="grid sm:grid-cols-2 gap-4 my-6">
          {[0, 1].map((slotIdx) => {
            const player = matchState.players[slotIdx];
            const isMe = player?.token === playerToken;

            return (
              <div
                key={slotIdx}
                data-testid={`lobby-slot-${slotIdx}`}
                className={`p-5 rounded-xl border transition ${
                  player
                    ? player.ready
                      ? 'bg-emerald-950/30 border-emerald-500/50'
                      : 'bg-slate-900/90 border-cyan-500/35'
                    : 'bg-slate-950/60 border-dashed border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono uppercase text-slate-400">
                    SLOT 0{slotIdx + 1} {isMe ? '(YOU)' : ''}
                  </span>
                  {player ? (
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold ${
                        player.ready
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {player.ready ? 'READY' : 'NOT READY'}
                    </span>
                  ) : (
                    <span className="text-xs font-mono text-slate-500">
                      WAITING...
                    </span>
                  )}
                </div>

                {player ? (
                  <div>
                    <div className="font-display text-lg font-bold text-white flex items-center gap-2">
                      <span>{player.name}</span>
                      {player.connected ? (
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      ) : (
                        <span className="text-xs font-mono text-rose-400">
                          (Reconnecting...)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1 font-mono">
                      Architect ID: {player.id}
                    </p>
                  </div>
                ) : (
                  <div className="py-4 text-center">
                    <Users className="w-6 h-6 text-slate-600 mx-auto mb-1.5" />
                    <p className="text-xs font-mono text-slate-400">
                      Share code{' '}
                      <strong className="text-cyan-300">
                        {matchState.roomCode}
                      </strong>{' '}
                      with Player 2
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Ready Action Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={onLeaveLobby}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300"
          >
            ← Leave Lobby
          </button>

          {me ? (
            <button
              type="button"
              data-testid="lobby-ready-btn"
              onClick={() => onToggleReady(!me.ready)}
              className={`w-full sm:w-auto px-8 py-3.5 rounded-xl font-display font-bold text-sm flex items-center justify-center gap-2 transition ${
                me.ready
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-neon-emerald'
                  : 'bg-cyan-400 hover:bg-cyan-300 text-slate-950 shadow-neon-cyan'
              }`}
            >
              {me.ready ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>READY LOCKED (CLICK TO UNREADY)</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>READY FOR BATTLE</span>
                </>
              )}
            </button>
          ) : (
            <div className="px-4 py-2 rounded-xl bg-purple-500/20 border border-purple-400/40 text-xs font-mono text-purple-200">
              Joined as Live Spectator ({matchState.spectatorCount} watching)
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
