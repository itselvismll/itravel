export const logger = {
  log: (...args) => { if (__DEV__) console.log(...args); },
  error: (...args) => { if (__DEV__) console.error(...args); },
  warn: (...args) => { if (__DEV__) console.warn(...args); },
};

export default logger;
