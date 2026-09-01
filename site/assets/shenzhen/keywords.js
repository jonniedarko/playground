/* =========================================================================
   NLP2 keyword hashes.

   The manual does not give the hash function - only worked examples - so
   this is not a hash implementation. It is the finite list of keywords the
   manual actually publishes, transcribed: the twenty-four on the TV keyword
   list plus the two the NLP2 datasheet uses as its own examples.

   A word outside this table has no hash anywhere in the manual, and none is
   invented here: keywordHash() returns null and the caller decides.

   The same table is printed on the TV keyword list page. A test compares
   the two, so the page and this file cannot drift apart silently.
   ========================================================================= */

/** keyword -> the six-digit hash, as the pair of 3-digit values it is sent as. */
export const KEYWORD_HASHES = {
  // Raven Dynamics NLP2 datasheet's own two examples.
  RAVEN: [271, 390],
  DYNAMICS: [109, 874],

  // Truth Investigators | 盘根究底
  MURDER: [102, 113],
  BASEMENT: [325, 475],
  'TENNIS RACKET': [526, 367],
  BIRTHDAY: [520, 817],
  'MOTHER-IN-LAW': [352, 559],
  'MUSHROOM BURGER': [815, 628],

  // Get the Throne | 权力的战争
  EMPEROR: [711, 573],
  CENTURIONS: [495, 160],
  'POISON MASTER': [575, 645],
  MIDWIFE: [712, 917],
  'DWARF REBELLION': [356, 361],
  'SHADOW ZONE': [138, 420],

  // Memories of Tomorrow | 明日记忆
  PODCAST: [238, 458],
  BOYFRIEND: [902, 197],
  'TROLLEY BUS': [814, 228],
  SHRUB: [944, 156],
  AQUARIUM: [873, 873],
  "COLLECTOR'S EDITION": [821, 345],

  // My Roommate is a Lamia | 我的室友是蛇精
  LAMIA: [870, 707],
  SUCCUBUS: [901, 711],
  'BASS GUITAR': [832, 502],
  'SEAT BELT': [599, 884],
  'TISSUE PAPER': [410, 266],
  'DENTAL INSURANCE': [877, 876],
}

/**
 * The hash pair for a keyword, or null if the manual does not publish one.
 * Case-insensitive, since the pages print the keywords in capitals and a
 * caller should not have to.
 */
export function keywordHash(word) {
  const key = String(word).trim().toUpperCase()
  return Object.prototype.hasOwnProperty.call(KEYWORD_HASHES, key) ? KEYWORD_HASHES[key] : null
}

export default KEYWORD_HASHES
