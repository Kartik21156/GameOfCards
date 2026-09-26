import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store/game.ts';

export function Chat({ className = '' }: { className?: string }) {
  const chat = useGame((s) => s.chat);
  const send = useGame((s) => s.sendChat);
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [chat.length]);

  return (
    <div className={`panel flex min-h-0 flex-col ${className}`}>
      <div className="label border-b border-white/10 px-3 py-2">Table chat</div>
      <div ref={list} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2 text-sm">
        {chat.length === 0 && <p className="text-cream/40">Say hi 👋</p>}
        {chat.map((m) =>
          m.system ? (
            <p key={m.id} className="text-xs text-cream/45 italic">
              {m.text}
            </p>
          ) : (
            <p key={m.id} className="break-words">
              <span className="font-semibold text-gold-300">{m.name}</span> <span className="text-cream/90">{m.text}</span>
            </p>
          ),
        )}
      </div>
      <form
        className="flex gap-2 border-t border-white/10 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          send(text);
          setText('');
        }}
      >
        <input
          className="input py-1.5 text-sm"
          value={text}
          maxLength={300}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message"
        />
        <button className="btn-ghost px-3 py-1.5">Send</button>
      </form>
    </div>
  );
}
