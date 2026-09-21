#!/usr/bin/env node
import { main } from "../dist/main.js";

const code = await main();
process.exitCode = code;
