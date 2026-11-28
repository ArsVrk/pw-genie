'use strict';
/* Supabase project for players' builds. Both values are public (the database only accepts writes through
   save_build / delete_build, which check the author's secret). Empty = the builds list is off. */
const SUPABASE = {
  url: '',
  key: '',
};
