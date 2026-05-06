export default function ItemList({ items, dotClass, emptyText }) {
  if (!items || items.length === 0) {
    return <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>{emptyText || 'None'}</p>;
  }

  return (
    <ul className="item-list">
      {items.map((item, i) => (
        <li key={i}>
          <span className={`dot ${dotClass}`} />
          {item}
        </li>
      ))}
    </ul>
  );
}
