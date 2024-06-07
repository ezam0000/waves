// src/pages/index.js

import { useState } from 'react';
import styled from 'styled-components';
import ToneGenerator from '../components/ToneGenerator';
import WaveVisualizer from '../components/WaveVisualizer';

const AppContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: #282c34;
  color: white;
  min-height: 100vh;
  justify-content: center;
  font-size: calc(10px + 2vmin);
  text-align: center;
`;

const ControlsContainer = styled.div`
  margin-bottom: 20px;
`;

const Home = () => {
  const [frequency, setFrequency] = useState(440);

  return (
    <AppContainer>
      <ControlsContainer>
        <ToneGenerator setFrequency={setFrequency} />
      </ControlsContainer>
      <WaveVisualizer frequency={frequency} />
    </AppContainer>
  );
};

export default Home;