import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { OxygenUIThemeProvider, WSO2Theme, useColorScheme } from '@wso2/oxygen-ui';
import { StudioProvider } from './studio-context.jsx';
import { Studio } from './Studio.jsx';
import './studio.css';

const THEMES = [{ key: 'wso2', label: 'WSO2', theme: WSO2Theme }];

function DarkStudio({ children }) {
  const { mode, setMode } = useColorScheme();
  useEffect(() => { if (mode !== 'dark') setMode('dark'); }, [mode, setMode]);
  return mode === 'dark' ? children : null;
}

createRoot(document.querySelector('#root')).render(
  <OxygenUIThemeProvider themes={THEMES} initialTheme="wso2">
    <DarkStudio><StudioProvider><Studio /></StudioProvider></DarkStudio>
  </OxygenUIThemeProvider>,
);
