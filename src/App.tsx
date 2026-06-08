/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Tv, Sliders, Layers, Info, ExternalLink, RefreshCw, Star } from 'lucide-react';
import OperatorPanel from './components/OperatorPanel';
import PlayerView from './components/PlayerView';

type ViewMode = 'operator' | 'player' | 'split';

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('operator'); // default to operator console on main entry

  // Check URL query parameters for override modes (e.g. ?mode=player or ?mode=operator)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get('mode');
    if (modeParam === 'player') {
      setViewMode('player');
    } else if (modeParam === 'operator') {
      setViewMode('operator');
    }
  }, []);

  // Sync title tag of the browser tab
  useEffect(() => {
    if (viewMode === 'player') {
      document.title = "TERMINAL DE ÁUDIO HMMB (Lobby/Recepção)";
    } else if (viewMode === 'operator') {
      document.title = "Painel do Operador - HMMB Sonorização";
    } else {
      document.title = "Simulador Integrado - HMMB Sonorização";
    }
  }, [viewMode]);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans" id="hmmb_app_root">
      
      {/* GLOBAL VIEWPORT SWITCHER TOP BAR (only shown when not in pure play/full mode or when requested) */}
      {viewMode !== 'player' && (
        <header className="bg-slate-900 border-b border-slate-800 text-white px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs z-50 shadow-md md:px-6">
          <div className="flex items-center gap-2">
            <span className="inline-block bg-rose-600 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-extrabold font-mono animate-pulse">SISTEMA HOSPITALAR HMMB</span>
            <span className="text-slate-400 font-medium hidden sm:inline">|</span>
            <span className="text-slate-200 font-sans font-semibold hidden sm:inline">Central de Sonorização e Anúncios Padrão</span>
          </div>

          {/* Mode switch pills */}
          <div className="flex items-center gap-1.5 bg-slate-850 p-1 rounded-lg border border-slate-700/50">
            <button
              onClick={() => setViewMode('split')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 font-sans font-bold cursor-pointer transition-all ${
                viewMode === 'split'
                  ? 'bg-orange-600 text-white shadow font-extrabold scale-102'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Simulador Dividido
            </button>
            <button
              onClick={() => setViewMode('operator')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 font-sans font-bold cursor-pointer transition-all ${
                viewMode === 'operator'
                  ? 'bg-slate-700 text-white shadow font-extrabold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              Painel do Operador
            </button>
            <button
              onClick={() => setViewMode('player')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 font-sans font-bold cursor-pointer transition-all ${
                viewMode === 'player'
                  ? 'bg-indigo-600 text-white shadow font-extrabold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Tv className="h-3.5 w-3.5" />
              Receptor Som (TV)
            </button>
          </div>

          <div className="hidden lg:flex items-center gap-3">
            <a 
              href="?mode=player" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-slate-300 hover:text-white text-[11px] font-sans font-bold flex items-center gap-1"
            >
              Link Separado (Modo Player) <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </header>
      )}

      {/* RENDER THE SELECTED ACTION MODULE VIEWPORTS */}
      <main className="flex-1 flex flex-col" id="app_mainframe">
        {viewMode === 'operator' && (
          <div className="flex-1 flex flex-col">
            <OperatorPanel />
          </div>
        )}

        {viewMode === 'player' && (
          <div className="flex-1 flex flex-col">
            <PlayerView />
          </div>
        )}

        {viewMode === 'split' && (
          <div className="flex-1 flex flex-col xl:flex-row h-full min-h-[calc(100vh-45px)]" id="split_monitor_simulation">
            {/* Split Screen left: Operator Panel */}
            <div className="flex-1 border-b xl:border-b-0 xl:border-r border-slate-200 overflow-auto flex flex-col">
              <div className="bg-orange-50 px-4 py-2 border-b border-orange-100 flex items-center justify-between text-xs font-semibold text-orange-850">
                <span className="flex items-center gap-1.5">
                  <Sliders className="h-4 w-4 text-orange-600" /> MONITOR 1: PAINEL DE CONTROLE (OPERADOR)
                </span>
                <span className="text-[10px] font-normal bg-orange-100 px-2 py-0.5 rounded italic text-orange-800">Dispara comandos de som</span>
              </div>
              <div className="flex-1 flex flex-col">
                <OperatorPanel />
              </div>
            </div>

            {/* Split Screen right: Receiver Screen view */}
            <div className="flex-1 bg-slate-950 flex flex-col overflow-auto">
              <div className="bg-indigo-950 px-4 py-2 border-b border-indigo-900 flex items-center justify-between text-xs font-semibold text-indigo-300">
                <span className="flex items-center gap-1.5">
                  <Tv className="h-4 w-4 text-indigo-400" /> MONITOR 2: SAÍDA DE ÁUDIO DO LOBBY / TV RECEPTORA
                </span>
                <span className="text-[10px] font-normal bg-indigo-900 px-2 py-0.5 rounded italic">Toca os arquivos de áudio</span>
              </div>
              <div className="flex-1 flex flex-col">
                <PlayerView />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* FLOATING DEVELOPER WATERMARK / INFO TIP */}
      {viewMode === 'split' && (
        <div className="bg-slate-900 text-slate-300 text-xs py-3 px-4 border-t border-slate-800 text-center flex flex-col sm:flex-row items-center justify-center gap-4 font-sans font-medium" id="simulation_explanatory_info_footer">
          <p className="flex items-center justify-center gap-1">
            <Info className="h-4 w-4 text-orange-500" /> 
            <strong>Modo Simulador de Tela Dupla Atibo!</strong> Experimente clicar em "Tocar" em qualquer aviso à esquerda para vê-lo executando sincronizado à direita.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setViewMode('operator')}
              className="text-[11px] text-white hover:underline focus:outline-none font-bold"
            >
              Ver apenas Operador
            </button>
            <span className="text-slate-600">|</span>
            <button
              onClick={() => setViewMode('player')}
              className="text-[11px] text-white hover:underline focus:outline-none font-bold"
            >
              Ver apenas TV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
