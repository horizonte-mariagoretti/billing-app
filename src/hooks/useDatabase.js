import { useCallback } from 'react';

const useDatabase = () => {
  if (!window.appDb?.query) {
    throw new Error('Database is not ready (window.appDb is missing).');
  }

  const query = useCallback(async (sql, params) => {
    try {
      return await window.appDb.query(sql, params);
    } catch (err) {
      console.error('Database Query Error:', err);
      throw err;
    }
  }, []);

  const run = useCallback(async (sql, params) => {
    try {
      return await window.appDb.run(sql, params);
    } catch (err) {
      console.error('Database Run Error:', err);
      throw err;
    }
  }, []);

  const transaction = useCallback(async (operations) => {
    try {
      return await window.appDb.transaction(operations);
    } catch (err) {
      console.error('Database Transaction Error:', err);
      throw err;
    }
  }, []);

  return { query, run, transaction };
};

export default useDatabase;
