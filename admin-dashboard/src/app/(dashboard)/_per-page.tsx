'use client';

type PerPageSelectProps = {
  value: number;
  options: number[];
};

/**
 * Small native select that submits its GET form on change so the table
 * re-opens with the chosen page size (page resets, filters preserved).
 */
export default function PerPageSelect({ value, options }: PerPageSelectProps) {
  const choices = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
  return (
    <label className="flex items-center gap-2 whitespace-nowrap">
      Show per page
      <select
        name="perPage"
        defaultValue={String(value)}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="field-sm select w-auto"
      >
        {choices.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
