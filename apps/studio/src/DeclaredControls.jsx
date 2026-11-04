import { useEffect, useState } from 'react';
import { FormControlLabel, MenuItem, Switch, TextField } from '@wso2/oxygen-ui';

function Field({ field, value, assets, onChange }) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);
  if (field.type === 'boolean') return <FormControlLabel label={field.label} control={<Switch checked={Boolean(value)} onChange={event => onChange(event.target.checked)} />} />;
  const options = field.type === 'asset' ? Object.keys(assets).map(value => ({ value, label: value })) : field.type === 'select' ? field.options : null;
  if (options) return <TextField select fullWidth size="small" label={field.label} value={value ?? ''} onChange={event => onChange(event.target.value)} sx={{ mb: 1.5 }}>{options.map(option => <MenuItem key={String(option.value)} value={option.value}>{option.label}</MenuItem>)}</TextField>;
  const save = () => {
    if (field.type === 'number' && draft === '') return;
    const next = field.type === 'number' ? Number(draft) : draft;
    if (next !== value) onChange(next);
  };
  const multiline = field.type === 'text' && field.multiline === true;
  return <TextField multiline={multiline} minRows={multiline ? 3 : undefined} maxRows={multiline ? 8 : undefined} fullWidth size="small" label={field.label} type={field.type === 'number' ? 'number' : field.type === 'color' ? 'color' : 'text'} value={draft} onChange={event => setDraft(event.target.value)} onBlur={save} onKeyDown={event => { if (event.key === 'Enter' && (!multiline || event.ctrlKey || event.metaKey)) { if (multiline) event.preventDefault(); save(); } }} inputProps={{ min: field.min, max: field.max, step: field.step, maxLength: field.maxLength }} sx={{ mb: 1.5 }} />;
}

export function DeclaredControls({ fields = [], values = {}, assets = {}, onChange }) {
  return fields.map(field => <Field key={field.id} field={field} value={values[field.id] ?? field.default} assets={assets} onChange={value => onChange(field.id, value)} />);
}
