#!/usr/bin/env bun
import React from 'react';
import { render } from 'ink';
import { App } from './components/App.js';
import { parseArgs } from './lib/cli-args.js';

const args = parseArgs();

render(<App devMode={args.devMode} />);
