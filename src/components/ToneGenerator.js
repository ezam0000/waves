// src/components/ToneGenerator.js

import { useState, useEffect } from 'react';
import styled from 'styled-components';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: #282c34;
  color: white;
  padding: 20px;
  border-radius: 10px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
`;

const Input = styled.input`
  margin: 10px;
  padding: 10px;
  font-size: 16px;
  border: 2px solid #61dafb;
  border-radius: 5px;
  background: #20232a;
  color: white;
  outline: none;
  text-align: center;
  width: 80px;
`;

const Button = styled.button`
  margin: 5px;
  padding: 10px;
  font-size: 16px;
  border: none;
  border-radius: 5px;
  background-color: #61dafb;
  color: #20232a;
  cursor: pointer;
  transition: background-color 0.3s ease;

  &:hover {
    background-color: #21a1f1;
  }
`;

const ToneGenerator = ({ setFrequency }) => {
  const [frequency, setFreq] = useState(440);
  const [audioContext, setAudioContext] = useState(null);
  const [oscillator, setOscillator] = useState(null);

  useEffect(() => {
    if (audioContext && oscillator) {
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      setFrequency(frequency);
    }
  }, [frequency]);

  const startTone = () => {
    if (!audioContext) {
      const context = new (window.AudioContext || window.webkitAudioContext)();
      const osc = context.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, context.currentTime);
      osc.connect(context.destination);
      osc.start();
      setAudioContext(context);
      setOscillator(osc);
    }
  };

  const stopTone = () => {
    if (oscillator) {
      oscillator.stop();
      oscillator.disconnect();
      setOscillator(null);
      setAudioContext(null);
    }
  };

  return (
    <Container>
      <Input
        type="number"
        value={frequency}
        onChange={(e) => setFreq(Number(e.target.value))}
        min="20"
        max="20000"
      />
      <Button onClick={startTone}>Start Tone</Button>
      <Button onClick={stopTone}>Stop Tone</Button>
    </Container>
  );
};

export default ToneGenerator;