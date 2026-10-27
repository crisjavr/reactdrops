import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  ShowcasePointer,
  type CursorConfig,
  type ShowcasePointerProps,
} from '@reactdrops/components/showcase-pointer';

export type ShowcaseDemo = 'together' | 'click' | 'drag' | 'select';
export type DemoCursor = { name: string; color: string };
type Shared = Omit<
  ShowcasePointerProps,
  'cursors' | 'children' | 'onCycle' | 'onCursorPress'
> & {
  people: DemoCursor[];
};

const person = (people: DemoCursor[], index: number, id: string) => ({
  id,
  name: people[index]?.name || id,
  color: people[index]?.color || '#0d99ff',
});

/* ---------- Click ---------- */

function ClickDemo({ people, ...props }: Shared) {
  const [state, setState] = useState<'draft' | 'publishing' | 'live'>('draft');
  const [previewed, setPreviewed] = useState(false);
  useEffect(() => {
    if (state !== 'publishing') return;
    const timer = window.setTimeout(() => setState('live'), 650);
    return () => window.clearTimeout(timer);
  }, [state]);
  const cursors: CursorConfig[] = [
    {
      ...person(people, 0, 'kubai'),
      start: { x: '78%', y: '80%' },
      script: [
        { action: 'enter' },
        { action: 'wait', duration: 500 },
        { action: 'hover', target: '[data-demo="preview"]' },
        { action: 'wait', duration: 700 },
        { action: 'click', target: '[data-demo="preview"]' },
        { action: 'wait', duration: 600 },
        { action: 'hover', target: '[data-demo="publish"]' },
        { action: 'wait', duration: 450 },
        { action: 'click', target: '[data-demo="publish"]' },
        { action: 'wait', duration: 700 },
        { action: 'say', text: 'Shipped!', duration: 1800 },
        { action: 'move', to: { x: '70%', y: '78%' } },
        { action: 'wait', duration: 1800 },
      ],
    },
  ];
  return (
    <ShowcasePointer
      {...props}
      cursors={cursors}
      className="mpc-demo"
      onCursorPress={({ target }) => {
        if (target.closest('[data-demo="preview"]')) setPreviewed((value) => !value);
        if (target.closest('[data-demo="publish"]'))
          setState((value) => (value === 'draft' ? 'publishing' : value));
      }}
      onCycle={() => {
        setState('draft');
        setPreviewed(false);
      }}
    >
      <div className="mpc-card mpc-publish">
        <div className="mpc-publish-head">
          <span className="mpc-thumb" aria-hidden="true" />
          <div>
            <p className="mpc-title">Landing page v2</p>
            <p className="mpc-muted">Edited 2 minutes ago</p>
          </div>
          <span className={`mpc-chip is-${state === 'live' ? 'live' : 'draft'}`}>
            {state === 'live' ? 'Live' : 'Draft'}
          </span>
        </div>
        <div className="mpc-actions">
          <button
            type="button"
            className="mpc-button is-secondary"
            data-demo="preview"
            data-active={previewed || undefined}
            onClick={() => setPreviewed((value) => !value)}
          >
            {previewed ? 'Previewing' : 'Preview'}
          </button>
          <button
            type="button"
            className="mpc-button is-primary"
            data-demo="publish"
            data-state={state}
            onClick={() => setState((value) => (value === 'draft' ? 'publishing' : value))}
          >
            {state === 'draft' ? 'Publish' : state === 'publishing' ? 'Publishing…' : 'Published'}
          </button>
        </div>
      </div>
    </ShowcasePointer>
  );
}

/* ---------- Drag ---------- */

type Column = 'todo' | 'doing' | 'done';
const initialCards: { id: string; title: string; tag: string; column: Column }[] = [
  { id: 'hero', title: 'Hero animation', tag: 'Motion', column: 'todo' },
  { id: 'copy', title: 'Pricing copy', tag: 'Content', column: 'todo' },
  { id: 'nav', title: 'Mobile nav', tag: 'UI', column: 'doing' },
  { id: 'logo', title: 'Logo refresh', tag: 'Brand', column: 'done' },
];
const columns: { id: Column; title: string }[] = [
  { id: 'todo', title: 'To do' },
  { id: 'doing', title: 'In progress' },
  { id: 'done', title: 'Done' },
];

/** A small pointer-driven board. The simulated cursors use the same handlers as a real mouse. */
function useBoard() {
  const [cards, setCards] = useState(initialCards);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const session = useRef<{ id: string; pointer: number; x: number; y: number } | null>(null);
  const settle = useRef<{ id: string; rect: DOMRect } | null>(null);
  const board = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const pending = settle.current;
    if (!pending || !board.current) return;
    settle.current = null;
    const element = board.current.querySelector<HTMLElement>(`[data-card="${pending.id}"]`);
    if (!element) return;
    const rect = element.getBoundingClientRect();
    element.animate(
      [
        {
          transform: `translate(${pending.rect.left - rect.left}px, ${pending.rect.top - rect.top}px) rotate(2deg) scale(1.03)`,
        },
        { transform: 'none' },
      ],
      { duration: 420, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
  }, [cards]);

  const onPointerDown = (id: string) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || session.current) return;
    session.current = { id, pointer: event.pointerId, x: event.clientX, y: event.clientY };
    setDrag({ id, dx: 0, dy: 0 });
    const move = (next: PointerEvent) => {
      const current = session.current;
      if (!current || next.pointerId !== current.pointer) return;
      setDrag({ id: current.id, dx: next.clientX - current.x, dy: next.clientY - current.y });
    };
    const up = (next: PointerEvent) => {
      const current = session.current;
      if (!current || next.pointerId !== current.pointer) return;
      session.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const element = board.current?.querySelector(`[data-card="${current.id}"]`);
      const target = [
        ...(board.current?.querySelectorAll<HTMLElement>('[data-column]') ?? []),
      ].find((column) => {
        const rect = column.getBoundingClientRect();
        return next.clientX >= rect.left && next.clientX <= rect.right;
      });
      if (element) settle.current = { id: current.id, rect: element.getBoundingClientRect() };
      setDrag(null);
      setCards((old) => {
        const column = (target?.dataset.column as Column | undefined) ?? undefined;
        const card = old.find((item) => item.id === current.id);
        if (!card || !column) return [...old];
        return [...old.filter((item) => item.id !== card.id), { ...card, column }];
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return {
    board,
    cards,
    drag,
    onPointerDown,
    reset: useCallback(() => setCards(initialCards), []),
  };
}

function Board({ state }: { state: ReturnType<typeof useBoard> }) {
  return (
    <div className="mpc-board" ref={state.board}>
      {columns.map((column) => (
        <section key={column.id} className="mpc-column" data-column={column.id}>
          <header>
            <span>{column.title}</span>
            <span className="mpc-count">
              {state.cards.filter((card) => card.column === column.id).length}
            </span>
          </header>
          {state.cards
            .filter((card) => card.column === column.id)
            .map((card) => {
              const dragging = state.drag?.id === card.id;
              return (
                <article
                  key={card.id}
                  className="mpc-task"
                  data-card={card.id}
                  data-dragging={dragging || undefined}
                  style={
                    dragging
                      ? {
                          transform: `translate(${state.drag!.dx}px, ${state.drag!.dy}px) rotate(2deg) scale(1.03)`,
                        }
                      : undefined
                  }
                  onPointerDown={state.onPointerDown(card.id)}
                >
                  <span className={`mpc-tag is-${card.tag.toLowerCase()}`}>{card.tag}</span>
                  <p>{card.title}</p>
                </article>
              );
            })}
        </section>
      ))}
    </div>
  );
}

function DragDemo({ people, ...props }: Shared) {
  const board = useBoard();
  const cursors: CursorConfig[] = [
    {
      ...person(people, 0, 'kubai'),
      start: { x: '18%', y: '80%' },
      script: [
        { action: 'enter' },
        { action: 'wait', duration: 400 },
        {
          action: 'drag',
          from: { target: '[data-card="hero"]', x: 0.42, y: 0.55 },
          to: { target: '[data-column="doing"]', x: 0.46, y: 0.62 },
        },
        { action: 'say', text: 'On it', duration: 1500 },
        { action: 'wait', duration: 900 },
        { action: 'move', to: { x: '40%', y: '72%' } },
        { action: 'wait', duration: 2600 },
      ],
    },
    {
      ...person(people, 1, 'mara'),
      start: { x: '84%', y: '80%' },
      script: [
        { action: 'enter' },
        { action: 'wait', duration: 2600 },
        {
          action: 'drag',
          from: { target: '[data-card="nav"]', x: 0.6, y: 0.5 },
          to: { target: '[data-column="done"]', x: 0.52, y: 0.5 },
        },
        { action: 'say', text: 'Done!', duration: 1500 },
        { action: 'move', to: { x: '78%', y: '72%' } },
        { action: 'wait', duration: 1800 },
      ],
    },
  ];
  return (
    <ShowcasePointer {...props} cursors={cursors} className="mpc-demo" onCycle={board.reset}>
      <div className="mpc-card mpc-board-card">
        <Board state={board} />
      </div>
    </ShowcasePointer>
  );
}

/* ---------- Select ---------- */

// Grey gradient squares, like the ReactDrops loader.
const tiles = [
  'linear-gradient(135deg, #8f8f8f, #4a4a4a)',
  'linear-gradient(160deg, #4f4f4f, #9b9b9b)',
  'linear-gradient(120deg, #b5b5b5, #6a6a6a)',
  'linear-gradient(200deg, #a8a8a8, #5c5c5c)',
  'linear-gradient(135deg, #3f3f3f, #808080)',
  'linear-gradient(150deg, #c4c4c4, #7d7d7d)',
];

function Tiles() {
  return (
    <div className="mpc-tiles">
      {tiles.map((color, index) => (
        <span
          key={color}
          className="mpc-tile"
          data-tile={index}
          style={{ '--tile': color } as CSSProperties}
        />
      ))}
    </div>
  );
}

function SelectDemo({ people, ...props }: Shared) {
  const cursors: CursorConfig[] = [
    {
      ...person(people, 0, 'kubai'),
      start: { x: '30%', y: '80%' },
      script: [
        { action: 'enter' },
        { action: 'wait', duration: 300 },
        { action: 'select', target: '[data-demo="copy"]', start: 4, end: 43 },
        { action: 'say', text: 'Tighten this?', duration: 1800 },
        { action: 'move', to: { x: '34%', y: '72%' } },
        { action: 'wait', duration: 2600 },
      ],
    },
    {
      ...person(people, 1, 'mara'),
      start: { x: '84%', y: '80%' },
      script: [
        { action: 'enter' },
        { action: 'wait', duration: 1400 },
        {
          action: 'marquee',
          from: { target: '[data-tile="0"]', x: -0.12, y: -0.14 },
          to: { target: '[data-tile="4"]', x: 1.06, y: 1.07 },
          items: '[data-tile]',
        },
        { action: 'say', text: '4 selected', duration: 1600 },
        { action: 'move', to: { x: '80%', y: '72%' } },
        { action: 'wait', duration: 1800 },
      ],
    },
  ];
  return (
    <ShowcasePointer {...props} cursors={cursors} className="mpc-demo">
      <div className="mpc-card mpc-select">
        <div className="mpc-doc">
          <p className="mpc-eyebrow">Brief</p>
          <h3 className="mpc-title">Spring campaign</h3>
          <p className="mpc-copy" data-demo="copy">
            Our new collection celebrates slow mornings and bright afternoons, with fabrics that
            breathe and colors borrowed from the first flowers of the season.
          </p>
        </div>
        <Tiles />
      </div>
    </ShowcasePointer>
  );
}

/* ---------- Together ---------- */

function TogetherDemo({ people, ...props }: Shared) {
  const [started, setStarted] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [likes, setLikes] = useState(12);
  const [liked, setLiked] = useState(false);
  const [draft, setDraft] = useState('');
  const [comments, setComments] = useState<string[]>([]);
  const theo = person(people, 2, 'theo');
  const send = () => {
    if (!draft.trim()) return;
    setComments((old) => [...old, draft.trim()]);
    setDraft('');
  };
  const cursors: CursorConfig[] = [
    {
      ...person(people, 0, 'kubai'),
      start: { x: '16%', y: '72%' },
      script: [
        { action: 'enter' },
        { action: 'wait', duration: 500 },
        { action: 'hover', target: '[data-demo="start"]' },
        { action: 'wait', duration: 600 },
        { action: 'click', target: '[data-demo="start"]' },
        { action: 'say', text: 'Looks great, let’s ship it today!', duration: 2800 },
        { action: 'move', to: { x: '22%', y: '74%' } },
        { action: 'wait', duration: 3000 },
      ],
    },
    {
      ...person(people, 1, 'mara'),
      start: { x: '50%', y: '44%' },
      script: [
        { action: 'enter' },
        { action: 'wait', duration: 1300 },
        { action: 'click', target: '[data-demo="switch"]' },
        { action: 'say', text: 'On', duration: 1400 },
        { action: 'move', to: { x: '54%', y: '46%' } },
        { action: 'wait', duration: 3000 },
      ],
    },
    {
      ...theo,
      start: { x: '88%', y: '80%' },
      script: [
        { action: 'enter' },
        { action: 'wait', duration: 1900 },
        { action: 'click', target: '[data-demo="like"]' },
        { action: 'wait', duration: 500 },
        { action: 'type', target: '[data-demo="comment"]', text: 'Ship it today?' },
        { action: 'click', target: '[data-demo="send"]' },
        { action: 'say', text: 'Sent', duration: 1400 },
        { action: 'move', to: { x: '86%', y: '76%' } },
        { action: 'wait', duration: 2400 },
      ],
    },
  ];
  return (
    <ShowcasePointer
      {...props}
      cursors={cursors}
      className="mpc-demo is-scatter"
      onCursorPress={({ target }) => {
        if (target.closest('[data-demo="start"]')) setStarted((value) => !value);
        if (target.closest('[data-demo="switch"]')) setNotifications((value) => !value);
        if (target.closest('[data-demo="like"]')) {
          setLiked((value) => !value);
          setLikes((value) => value + (liked ? -1 : 1));
        }
        if (target.closest('[data-demo="send"]')) send();
      }}
      onCycle={() => {
        setStarted(false);
        setNotifications(false);
        setLikes(12);
        setLiked(false);
        setDraft('');
        setComments([]);
      }}
    >
      <div className="mpc-scatter">
        <div className="mpc-card mpc-spot is-button">
          <div className="mpc-spot-head">
            <span className="mpc-thumb" aria-hidden="true" />
            <div>
              <p className="mpc-title">Starter kit</p>
              <p className="mpc-muted">12 components ready to use</p>
            </div>
          </div>
          <button
            type="button"
            className="mpc-button is-primary"
            data-demo="start"
            data-state={started ? 'live' : undefined}
            onClick={() => setStarted((value) => !value)}
          >
            {started ? 'Started ✓' : 'Get started'}
          </button>
        </div>
        <div className="mpc-card mpc-spot is-switch">
          <p className="mpc-title">Settings</p>
          <div className="mpc-row">
            <div>
              <p>Notifications</p>
              <p className="mpc-muted">Updates from your team</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifications}
              aria-label="Notifications"
              className="mpc-switch"
              data-demo="switch"
              onClick={() => setNotifications((value) => !value)}
            >
              <span />
            </button>
          </div>
        </div>
        <div className="mpc-card mpc-spot is-comments">
          <p className="mpc-title">Homepage hero</p>
          <div className="mpc-social">
            <button
              type="button"
              className="mpc-like"
              data-demo="like"
              data-liked={liked || undefined}
              onClick={() => {
                setLiked((value) => !value);
                setLikes((value) => value + (liked ? -1 : 1));
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
              </svg>
              {likes}
            </button>
            <form
              className="mpc-comment"
              style={{ '--showcase-pointer-cursor-color': theo.color } as CSSProperties}
              onSubmit={(event) => {
                event.preventDefault();
                send();
              }}
            >
              <input
                data-demo="comment"
                aria-label="Comment"
                placeholder="Add a comment"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button type="submit" className="mpc-send" data-demo="send" aria-label="Send">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12h13M13 6l6 6-6 6" />
                </svg>
              </button>
            </form>
          </div>
          {comments.map((comment, index) => (
            <p
              key={index}
              className="mpc-comment-row"
              style={{ '--showcase-pointer-cursor-color': theo.color } as CSSProperties}
            >
              <b>{theo.name}</b> {comment}
            </p>
          ))}
        </div>
      </div>
    </ShowcasePointer>
  );
}

export function ShowcasePointerDemo({ demo, ...props }: Shared & { demo: ShowcaseDemo }) {
  return demo === 'click' ? (
    <ClickDemo {...props} />
  ) : demo === 'drag' ? (
    <DragDemo {...props} />
  ) : demo === 'select' ? (
    <SelectDemo {...props} />
  ) : (
    <TogetherDemo {...props} />
  );
}
