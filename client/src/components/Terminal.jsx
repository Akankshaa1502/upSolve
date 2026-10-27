/** Page heading in the code style: `upSolve.dashboard()` + a `// comment` subtitle with a blinking caret. */
export function PageTitle({ name, children }) {
  return (
    <div className="page-title">
      <h1>
        <span className="kw">upSolve</span><span className="punc">.</span><span className="fn">{name}</span><span className="punc">()</span>
      </h1>
      {children && (
        <p className="sub"><span className="cm">//</span>{children}<span className="caret" aria-hidden /></p>
      )}
    </div>
  );
}

/** macOS-style window bar with traffic-light dots and a prompt, placed at the top of a card. */
export function TermBar({ cmd, comment }) {
  return (
    <div className="term-bar" aria-hidden>
      <span className="dots"><i /><i /><i /></span>
      <span className="prompt">&gt;_ <b>{cmd}</b>{comment && <span className="cm"> // {comment}</span>}</span>
    </div>
  );
}
