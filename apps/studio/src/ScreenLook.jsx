import { useEffect, useState } from 'react';
import { Box, ButtonBase, TextField, Typography } from '@wso2/oxygen-ui';

const FRAMES = { none: 'No frame', 'browser-light': 'Browser', 'browser-dark': 'Dark browser', window: 'Window' };

// Each card sketches its chrome: a bar with three dots, plus an address pill for browsers.
export function FramePicker({ value, onChange }) {
  return (
    <Box className="field">
      <Box className="field-label"><Typography variant="caption" color="text.secondary">Frame</Typography></Box>
      <Box className="frame-grid" role="radiogroup" aria-label="Frame">
        {Object.entries(FRAMES).map(([key, label]) => (
          <ButtonBase key={key} role="radio" aria-checked={value === key} className={`frame-card${value === key ? ' is-selected' : ''}`} onClick={() => onChange(key)}>
            <Box className={`frame-thumb frame-thumb-${key}`} aria-hidden="true"><i /><i /><i /></Box>
            <Typography variant="caption" noWrap>{label}</Typography>
          </ButtonBase>
        ))}
      </Box>
    </Box>
  );
}

export function FrameTitle({ frame, saved = '', onCommit }) {
  const [value, setValue] = useState(saved);
  useEffect(() => setValue(saved), [saved]);
  const save = () => { if (value !== saved) onCommit(value); };
  return <TextField label={frame === 'window' ? 'Window title' : 'Address'} placeholder={frame === 'window' ? 'Settings' : 'app.example.com'} size="small" fullWidth value={value} onChange={(event) => setValue(event.target.value)} onBlur={save} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); save(); } }} slotProps={{ htmlInput: { maxLength: 120 } }} sx={{ mb: 1.5 }} />;
}
