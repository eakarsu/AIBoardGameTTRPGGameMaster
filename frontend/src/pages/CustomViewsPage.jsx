import React from 'react';
import GameStateBoard from '../components/GameStateBoard.js';
import DiceProbability from '../components/DiceProbability.js';
import CharacterSheetPDF from '../components/CharacterSheetPDF.js';
import EncounterBuilder from '../components/EncounterBuilder.js';

export default function CustomViewsPage() {
  return (
    <div style={{ padding: 28, maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, color: '#f8fafc' }}>GM Views</h1>
        <p style={{ color: '#94a3b8', marginTop: 6 }}>
          Bespoke tools for the Game Master: hex battle map, dice probability
          analyzer, printable D&amp;D character sheets, and an encounter
          balance wizard.
        </p>
      </div>

      <div style={{ display: 'grid', gap: 20 }}>
        <GameStateBoard />
        <DiceProbability />
        <CharacterSheetPDF />
        <EncounterBuilder />
      </div>
    </div>
  );
}
