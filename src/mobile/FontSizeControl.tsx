export type TextSize = 'S' | 'M' | 'L';
export function FontSizeControl({ value, onChange, className = '' }: {
  value: TextSize; onChange: (value: TextSize) => void; className?: string;
}) {
  return <div className={`font-options ${className}`} role="group" aria-label="字号选择">
    {(['S', 'M', 'L'] as const).map((size, index) => <button key={size}
      aria-label={`${['小', '中', '大'][index]}字号`} aria-pressed={value === size}
      onClick={() => onChange(size)}>{['小', '中', '大'][index]}</button>)}
  </div>;
}
