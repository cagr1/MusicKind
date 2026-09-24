/**
 * TODOS los datos de ejemplo y simulación de procesos para MusicKind.
 * Ningún otro archivo inventa datos.
 */

export interface TrackFile {
  id: string;
  filename: string;
  path: string;
  size: string;
}

export interface ClassifierResult {
  id: string;
  filename: string;
  artist: string;
  title: string;
  bpm: number;
  key: string;
  artworkInitial: string;
  detectedGenre: string;
  source: "Spotify" | "Last.fm" | "BPM";
  destinationFolder: string;
}

export interface SetTrackResult {
  id: string;
  filename: string;
  artist: string;
  title: string;
  bpm: number;
  key: string;
  artworkInitial: string;
  warmupScore: number;
  peakScore: number;
  closingScore: number;
  bestSection: "Warmup" | "Peak" | "Closing";
}

export interface ConverterResult {
  id: string;
  filename: string;
  artist: string;
  title: string;
  targetFormat: "MP3" | "WAV" | "AIFF" | "FLAC";
  bitrate?: string;
  status: "OK" | "Error";
  outputPath: string;
}

export interface MetadataResult {
  id: string;
  filename: string;
  title: string;
  artist: string;
  album: string;
  year: string;
  genre: string;
  trackNumber: string;
  newFileName: string;
  confidence: number;
  bpm: number;
  key: string;
  artworkInitial: string;
}

export interface BpmTrackResult {
  id: string;
  filename: string;
  artist: string;
  title: string;
  artworkInitial: string;
  bpm: number;
  key: string;
  originalBpm: number;
  originalKey: string;
}

export interface StemsResult {
  id: string;
  sourceFile: string;
  artist: string;
  title: string;
  format: "WAV" | "MP3";
  vocalsPath: string;
  instrumentalPath: string;
}

export interface AppConfig {
  spotifyClientId: string;
  spotifyClientSecret: string;
  lastFmKey: string;
  acoustIdKey: string;
  language: "es" | "en";
  outputFolder: string;
  dependencies: Record<"ffmpeg" | "librosa" | "demucs", boolean>;
}

export const INITIAL_GENRES = [
  "Afro House",
  "Tech House",
  "Melodic Techno",
  "Deep House",
  "Indie Dance",
  "Organic House",
];

// 30 pistas realistas para biblioteca de DJ profesional (estilo Lexicon DJ)
export const MOCK_DJ_TRACKS: TrackFile[] = [
  { id: "trk-01", filename: "Rampa, Keinemusik - Cezanne 29 (Extended Mix).mp3", path: "/Music/Promos/Rampa - Cezanne 29.mp3", size: "16.4 MB" },
  { id: "trk-02", filename: "Adam Ten, Mita Gami - The Beat (Original Club Mix).wav", path: "/Music/Promos/Adam Ten - The Beat.wav", size: "62.1 MB" },
  { id: "trk-03", filename: "Anyma, Chris Avantgarde - Consciousness (Extended Mix).flac", path: "/Music/Promos/Anyma - Consciousness.flac", size: "48.9 MB" },
  { id: "trk-04", filename: "Vintage Culture, Maverick Sabre - Weak (Marco Lys Remix).aiff", path: "/Music/Promos/Vintage Culture - Weak.aiff", size: "68.3 MB" },
  { id: "trk-05", filename: "Black Coffee, David Guetta - Drive feat. Delilah (Extended Mix).mp3", path: "/Music/Promos/Black Coffee - Drive.mp3", size: "17.2 MB" },
  { id: "trk-06", filename: "Mochakk, Joni - Jealous (Extended Club Mix).mp3", path: "/Music/Promos/Mochakk - Jealous.mp3", size: "14.8 MB" },
  { id: "trk-07", filename: "Artbat, Argy, Zafrir - Tibet (Extended Mix).wav", path: "/Music/Promos/Artbat - Tibet.wav", size: "65.5 MB" },
  { id: "trk-08", filename: "HUGEL, Topic, Arash - I Adore You (Extended Mix).mp3", path: "/Music/Promos/HUGEL - I Adore You.mp3", size: "15.0 MB" },
  { id: "trk-09", filename: "Tale Of Us - Astral (Original Mix).wav", path: "/Music/Promos/Tale Of Us - Astral.wav", size: "59.2 MB" },
  { id: "trk-10", filename: "Adriatique, WhoMadeWho - Miracle (Rufus Du Sol Remix).flac", path: "/Music/Promos/Adriatique - Miracle.flac", size: "52.4 MB" },
  { id: "trk-11", filename: "Fisher, Aatig - Take It Off (Extended Mix).mp3", path: "/Music/Promos/Fisher - Take It Off.mp3", size: "13.6 MB" },
  { id: "trk-12", filename: "Dennis Cruz, Leo Leonski - El Sueño (Original Mix).wav", path: "/Music/Promos/Dennis Cruz - El Sueno.wav", size: "61.0 MB" },
  { id: "trk-13", filename: "Francis Mercier, Magic System - Premier Gaou (Extended).mp3", path: "/Music/Promos/Francis Mercier - Premier Gaou.mp3", size: "14.2 MB" },
  { id: "trk-14", filename: "Massano - The Feeling (2025 Remaster).wav", path: "/Music/Promos/Massano - The Feeling.wav", size: "64.8 MB" },
  { id: "trk-15", filename: "Pawsa - Pick Up The Phone (Extended Version).mp3", path: "/Music/Promos/Pawsa - Pick Up The Phone.mp3", size: "15.7 MB" },
  { id: "trk-16", filename: "CamelPhat, Elderbrook - Cola (Club Mix).flac", path: "/Music/Promos/CamelPhat - Cola.flac", size: "49.1 MB" },
  { id: "trk-17", filename: "Cloonee - Stephanie (Original Mix).mp3", path: "/Music/Promos/Cloonee - Stephanie.mp3", size: "14.5 MB" },
  { id: "trk-18", filename: "Bicep - Glue (Original Mix).wav", path: "/Music/Promos/Bicep - Glue.wav", size: "58.7 MB" },
  { id: "trk-19", filename: "Stephan Bodzin - Singularity (Original Mix).wav", path: "/Music/Promos/Stephan Bodzin - Singularity.wav", size: "72.4 MB" },
  { id: "trk-20", filename: "Chris Lake, Aluna - Beggin' (Extended Mix).mp3", path: "/Music/Promos/Chris Lake - Beggin.mp3", size: "13.9 MB" },
  { id: "trk-21", filename: "Bedouin - Whistleman (Pablo Fierro Remix).wav", path: "/Music/Promos/Bedouin - Whistleman.wav", size: "67.0 MB" },
  { id: "trk-22", filename: "Solomun - Customer Is King (Extended Mix).aiff", path: "/Music/Promos/Solomun - Customer Is King.aiff", size: "70.2 MB" },
  { id: "trk-23", filename: "John Summit, Hayla - Where You Are (Extended Mix).flac", path: "/Music/Promos/John Summit - Where You Are.flac", size: "51.8 MB" },
  { id: "trk-24", filename: "Gordo, Drake - Sideways (Extended Club Edit).mp3", path: "/Music/Promos/Gordo - Sideways.mp3", size: "16.1 MB" },
  { id: "trk-25", filename: "Maceo Plex - Mutant Romance (Original Mix).wav", path: "/Music/Promos/Maceo Plex - Mutant Romance.wav", size: "63.3 MB" },
  { id: "trk-26", filename: "Michael Bibi - Got The Fire (Extended Mix).mp3", path: "/Music/Promos/Michael Bibi - Got The Fire.mp3", size: "14.4 MB" },
  { id: "trk-27", filename: "Peggy Gou - (It Goes Like) Nanana (Original Mix).mp3", path: "/Music/Promos/Peggy Gou - Nanana.mp3", size: "15.3 MB" },
  { id: "trk-28", filename: "Kolsch - Grey (Original Mix).wav", path: "/Music/Promos/Kolsch - Grey.wav", size: "60.4 MB" },
  { id: "trk-29", filename: "Samm, Ajna - Does It Matter (Extended Mix).mp3", path: "/Music/Promos/Samm - Does It Matter.mp3", size: "15.8 MB" },
  { id: "trk-30", filename: "Dom Dolla - Rhyme Dust (Extended Mix).flac", path: "/Music/Promos/Dom Dolla - Rhyme Dust.flac", size: "47.6 MB" },
];

// 30 resultados mockeados con estado completo para la tabla del Clasificador
export const INITIAL_CLASSIFIER_RESULTS: ClassifierResult[] = [
  {
    id: "trk-01",
    filename: "Rampa, Keinemusik - Cezanne 29 (Extended Mix).mp3",
    artist: "Rampa, Keinemusik",
    title: "Cezanne 29 (Extended Mix)",
    bpm: 121,
    key: "8A",
    artworkInitial: "R",
    detectedGenre: "Afro House",
    source: "Spotify",
    destinationFolder: "/Music/Organized/Afro House",
  },
  {
    id: "trk-02",
    filename: "Adam Ten, Mita Gami - The Beat (Original Club Mix).wav",
    artist: "Adam Ten, Mita Gami",
    title: "The Beat (Original Club Mix)",
    bpm: 123,
    key: "11B",
    artworkInitial: "A",
    detectedGenre: "Indie Dance",
    source: "Last.fm",
    destinationFolder: "/Music/Organized/Indie Dance",
  },
  {
    id: "trk-03",
    filename: "Anyma, Chris Avantgarde - Consciousness (Extended Mix).flac",
    artist: "Anyma, Chris Avantgarde",
    title: "Consciousness (Extended Mix)",
    bpm: 126,
    key: "4A",
    artworkInitial: "A",
    detectedGenre: "Melodic Techno",
    source: "Spotify",
    destinationFolder: "/Music/Organized/Melodic Techno",
  },
  {
    id: "trk-04",
    filename: "Vintage Culture, Maverick Sabre - Weak (Marco Lys Remix).aiff",
    artist: "Vintage Culture, Marco Lys",
    title: "Weak (Extended Remix)",
    bpm: 126,
    key: "2A",
    artworkInitial: "V",
    detectedGenre: "Tech House",
    source: "BPM",
    destinationFolder: "/Music/Organized/Tech House",
  },
  {
    id: "trk-05",
    filename: "Black Coffee, David Guetta - Drive feat. Delilah (Extended Mix).mp3",
    artist: "Black Coffee, David Guetta",
    title: "Drive (Extended Mix)",
    bpm: 122,
    key: "6A",
    artworkInitial: "B",
    detectedGenre: "Afro House",
    source: "Spotify",
    destinationFolder: "/Music/Organized/Afro House",
  },
  {
    id: "trk-06",
    filename: "Mochakk, Joni - Jealous (Extended Club Mix).mp3",
    artist: "Mochakk, Joni",
    title: "Jealous (Extended Club Mix)",
    bpm: 127,
    key: "9A",
    artworkInitial: "M",
    detectedGenre: "Tech House",
    source: "Last.fm",
    destinationFolder: "/Music/Organized/Tech House",
  },
  {
    id: "trk-07",
    filename: "Artbat, Argy, Zafrir - Tibet (Extended Mix).wav",
    artist: "Artbat, Argy, Zafrir",
    title: "Tibet (Extended Mix)",
    bpm: 125,
    key: "1A",
    artworkInitial: "A",
    detectedGenre: "Melodic Techno",
    source: "Spotify",
    destinationFolder: "/Music/Organized/Melodic Techno",
  },
  {
    id: "trk-08",
    filename: "HUGEL, Topic, Arash - I Adore You (Extended Mix).mp3",
    artist: "HUGEL, Topic, Arash",
    title: "I Adore You (Extended Mix)",
    bpm: 122,
    key: "7A",
    artworkInitial: "H",
    detectedGenre: "Afro House",
    source: "Spotify",
    destinationFolder: "/Music/Organized/Afro House",
  },
  {
    id: "trk-09",
    filename: "Tale Of Us - Astral (Original Mix).wav",
    artist: "Tale Of Us",
    title: "Astral (Original Mix)",
    bpm: 124,
    key: "5A",
    artworkInitial: "T",
    detectedGenre: "Melodic Techno",
    source: "Spotify",
    destinationFolder: "/Music/Organized/Melodic Techno",
  },
  {
    id: "trk-10",
    filename: "Adriatique, WhoMadeWho - Miracle (Rufus Du Sol Remix).flac",
    artist: "Adriatique, Rufus Du Sol",
    title: "Miracle (Remix)",
    bpm: 124,
    key: "3A",
    artworkInitial: "A",
    detectedGenre: "Melodic Techno",
    source: "Spotify",
    destinationFolder: "/Music/Organized/Melodic Techno",
  },
  {
    id: "trk-11",
    filename: "Fisher, Aatig - Take It Off (Extended Mix).mp3",
    artist: "Fisher, Aatig",
    title: "Take It Off (Extended Mix)",
    bpm: 127,
    key: "11A",
    artworkInitial: "F",
    detectedGenre: "Tech House",
    source: "Last.fm",
    destinationFolder: "/Music/Organized/Tech House",
  },
  {
    id: "trk-12",
    filename: "Dennis Cruz, Leo Leonski - El Sueño (Original Mix).wav",
    artist: "Dennis Cruz",
    title: "El Sueño (Original Mix)",
    bpm: 125,
    key: "10A",
    artworkInitial: "D",
    detectedGenre: "Tech House",
    source: "Spotify",
    destinationFolder: "/Music/Organized/Tech House",
  },
  {
    id: "trk-13",
    filename: "Francis Mercier, Magic System - Premier Gaou (Extended).mp3",
    artist: "Francis Mercier",
    title: "Premier Gaou (Extended)",
    bpm: 123,
    key: "12B",
    artworkInitial: "F",
    detectedGenre: "Afro House",
    source: "Spotify",
    destinationFolder: "/Music/Organized/Afro House",
  },
  {
    id: "trk-14",
    filename: "Massano - The Feeling (2025 Remaster).wav",
    artist: "Massano",
    title: "The Feeling (2025 Remaster)",
    bpm: 128,
    key: "4A",
    artworkInitial: "M",
    detectedGenre: "Melodic Techno",
    source: "Spotify",
    destinationFolder: "/Music/Organized/Melodic Techno",
  },
  {
    id: "trk-15",
    filename: "Pawsa - Pick Up The Phone (Extended Version).mp3",
    artist: "Pawsa",
    title: "Pick Up The Phone",
    bpm: 128,
    key: "8B",
    artworkInitial: "P",
    detectedGenre: "Tech House",
    source: "BPM",
    destinationFolder: "/Music/Organized/Tech House",
  },
  {
    id: "trk-16",
    filename: "CamelPhat, Elderbrook - Cola (Club Mix).flac",
    artist: "CamelPhat, Elderbrook",
    title: "Cola (Club Mix)",
    bpm: 122,
    key: "10B",
    artworkInitial: "C",
    detectedGenre: "Deep House",
    source: "Spotify",
    destinationFolder: "/Music/Organized/Deep House",
  },
  {
    id: "trk-17",
    filename: "Cloonee - Stephanie (Original Mix).mp3",
    artist: "Cloonee",
    title: "Stephanie (Original Mix)",
    bpm: 127,
    key: "2B",
    artworkInitial: "C",
    detectedGenre: "Tech House",
    source: "Last.fm",
    destinationFolder: "/Music/Organized/Tech House",
  },
  {
    id: "trk-18",
    filename: "Bicep - Glue (Original Mix).wav",
    artist: "Bicep",
    title: "Glue (Original Mix)",
    bpm: 130,
    key: "6B",
    artworkInitial: "B",
    detectedGenre: "Indie Dance",
    source: "Spotify",
    destinationFolder: "/Music/Organized/Indie Dance",
  },
  {
    id: "trk-19",
    filename: "Stephan Bodzin - Singularity (Original Mix).wav",
    artist: "Stephan Bodzin",
    title: "Singularity (Original Mix)",
    bpm: 125,
    key: "1A",
    artworkInitial: "S",
    detectedGenre: "Melodic Techno",
    source: "Spotify",
    destinationFolder: "/Music/Organized/Melodic Techno",
  },
  {
    id: "trk-20",
    filename: "Chris Lake, Aluna - Beggin' (Extended Mix).mp3",
    artist: "Chris Lake, Aluna",
    title: "Beggin' (Extended Mix)",
    bpm: 126,
    key: "9B",
    artworkInitial: "C",
    detectedGenre: "Tech House",
    source: "Spotify",
    destinationFolder: "/Music/Organized/Tech House",
  },
  {
    id: "trk-21",
    filename: "Bedouin - Whistleman (Pablo Fierro Remix).wav",
    artist: "Bedouin, Pablo Fierro",
    title: "Whistleman (Remix)",
    bpm: 120,
    key: "7B",
    artworkInitial: "B",
    detectedGenre: "Organic House",
    source: "Last.fm",
    destinationFolder: "/Music/Organized/Organic House",
  },
  {
    id: "trk-22",
    filename: "Solomun - Customer Is King (Extended Mix).aiff",
    artist: "Solomun",
    title: "Customer Is King",
    bpm: 124,
    key: "5B",
    artworkInitial: "S",
    detectedGenre: "Deep House",
    source: "Spotify",
    destinationFolder: "/Music/Organized/Deep House",
  },
  {
    id: "trk-23",
    filename: "John Summit, Hayla - Where You Are (Extended Mix).flac",
    artist: "John Summit, Hayla",
    title: "Where You Are (Extended)",
    bpm: 126,
    key: "11B",
    artworkInitial: "J",
    detectedGenre: "Tech House",
    source: "Spotify",
    destinationFolder: "/Music/Organized/Tech House",
  },
  {
    id: "trk-24",
    filename: "Gordo, Drake - Sideways (Extended Club Edit).mp3",
    artist: "Gordo, Drake",
    title: "Sideways (Club Edit)",
    bpm: 124,
    key: "3B",
    artworkInitial: "G",
    detectedGenre: "Afro House",
    source: "Spotify",
    destinationFolder: "/Music/Organized/Afro House",
  },
  {
    id: "trk-25",
    filename: "Maceo Plex - Mutant Romance (Original Mix).wav",
    artist: "Maceo Plex",
    title: "Mutant Romance",
    bpm: 127,
    key: "12A",
    artworkInitial: "M",
    detectedGenre: "Melodic Techno",
    source: "Last.fm",
    destinationFolder: "/Music/Organized/Melodic Techno",
  },
  {
    id: "trk-26",
    filename: "Michael Bibi - Got The Fire (Extended Mix).mp3",
    artist: "Michael Bibi",
    title: "Got The Fire (Extended)",
    bpm: 128,
    key: "8A",
    artworkInitial: "M",
    detectedGenre: "Tech House",
    source: "Spotify",
    destinationFolder: "/Music/Organized/Tech House",
  },
  {
    id: "trk-27",
    filename: "Peggy Gou - (It Goes Like) Nanana (Original Mix).mp3",
    artist: "Peggy Gou",
    title: "(It Goes Like) Nanana",
    bpm: 130,
    key: "4B",
    artworkInitial: "P",
    detectedGenre: "Deep House",
    source: "Spotify",
    destinationFolder: "/Music/Organized/Deep House",
  },
  {
    id: "trk-28",
    filename: "Kolsch - Grey (Original Mix).wav",
    artist: "Kolsch",
    title: "Grey (Original Mix)",
    bpm: 125,
    key: "2A",
    artworkInitial: "K",
    detectedGenre: "Melodic Techno",
    source: "Spotify",
    destinationFolder: "/Music/Organized/Melodic Techno",
  },
  {
    id: "trk-29",
    filename: "Samm, Ajna - Does It Matter (Extended Mix).mp3",
    artist: "Samm, Ajna",
    title: "Does It Matter (Extended)",
    bpm: 121,
    key: "6A",
    artworkInitial: "S",
    detectedGenre: "Afro House",
    source: "Spotify",
    destinationFolder: "/Music/Organized/Afro House",
  },
  {
    id: "trk-30",
    filename: "Dom Dolla - Rhyme Dust (Extended Mix).flac",
    artist: "Dom Dolla",
    title: "Rhyme Dust (Extended Mix)",
    bpm: 127,
    key: "9A",
    artworkInitial: "D",
    detectedGenre: "Tech House",
    source: "Spotify",
    destinationFolder: "/Music/Organized/Tech House",
  },
];

export const INITIAL_SET_RESULTS: SetTrackResult[] = INITIAL_CLASSIFIER_RESULTS.slice(0, 16).map((trk, i) => {
  const warmup = Math.max(15, Math.min(96, (trk.bpm - 116) * 7 + (i % 5) * 12));
  const peak = Math.max(20, Math.min(99, (trk.bpm - 120) * 11 + 30 + (i % 3) * 14));
  const closing = Math.max(10, Math.min(92, 100 - peak + (i % 4) * 8));
  let best: "Warmup" | "Peak" | "Closing" = "Peak";
  if (warmup >= peak && warmup >= closing) best = "Warmup";
  else if (closing >= peak && closing >= warmup) best = "Closing";

  return {
    id: trk.id,
    filename: trk.filename,
    artist: trk.artist,
    title: trk.title,
    bpm: trk.bpm,
    key: trk.key,
    artworkInitial: trk.artworkInitial,
    warmupScore: warmup,
    peakScore: peak,
    closingScore: closing,
    bestSection: best,
  };
});

export const INITIAL_CONVERTER_RESULTS: ConverterResult[] = INITIAL_CLASSIFIER_RESULTS.slice(0, 12).map((trk) => ({
  id: trk.id,
  filename: trk.filename,
  artist: trk.artist,
  title: trk.title,
  targetFormat: "WAV",
  status: "OK",
  outputPath: `/Output/${trk.filename.replace(/\.[^.]+$/, "")}.wav`,
}));

export const INITIAL_METADATA_RESULTS: MetadataResult[] = INITIAL_CLASSIFIER_RESULTS.slice(0, 14).map((trk, idx) => ({
  id: trk.id,
  filename: trk.filename,
  title: trk.title,
  artist: trk.artist,
  album: `${trk.detectedGenre} Club Cuts Vol. ${idx + 1}`,
  year: "2025",
  genre: trk.detectedGenre,
  trackNumber: String(idx + 1),
  newFileName: `${trk.artist} - ${trk.title}.mp3`,
  confidence: 94 + (idx % 6),
  bpm: trk.bpm,
  key: trk.key,
  artworkInitial: trk.artworkInitial,
}));

export const INITIAL_BPM_RESULTS: BpmTrackResult[] = INITIAL_CLASSIFIER_RESULTS.slice(0, 15).map((trk) => ({
  id: trk.id,
  filename: trk.filename,
  artist: trk.artist,
  title: trk.title,
  artworkInitial: trk.artworkInitial,
  bpm: trk.bpm,
  key: trk.key,
  originalBpm: trk.bpm,
  originalKey: trk.key,
}));

export const INITIAL_STEMS_RESULT: StemsResult = {
  id: "stem-1",
  sourceFile: "Rampa, Keinemusik - Cezanne 29 (Extended Mix).mp3",
  artist: "Rampa, Keinemusik",
  title: "Cezanne 29 (Extended Mix)",
  format: "WAV",
  vocalsPath: "/Output/Stems/Rampa - Cezanne 29_(Vocals).wav",
  instrumentalPath: "/Output/Stems/Rampa - Cezanne 29_(Instrumental).wav",
};

export const INITIAL_CONFIG: AppConfig = {
  spotifyClientId: "sp_live_92018a47ffbc",
  spotifyClientSecret: "sp_sec_e830bf916ca11082c9f4",
  lastFmKey: "lfm_88201a009fb33",
  acoustIdKey: "aid_99b01c34",
  language: "es",
  outputFolder: "/Users/dj/Music/MusicKind Output",
  dependencies: {
    ffmpeg: true,
    librosa: true,
    demucs: false,
  },
};

export interface ProcessProgress {
  current: number;
  total: number;
  filename: string;
  logLine: string;
  percent: number;
}

export interface ProcessCallbacks<T> {
  onProgress: (progress: ProcessProgress) => void;
  onResult: (result: T) => void;
  onError: (error: string) => void;
}

export interface ProcessController {
  cancel: () => void;
  pause: () => void;
  resume: () => void;
}

export function runProcess<T>(
  kind: "classifier" | "sets" | "converter" | "metadata" | "bpm" | "stems",
  files: TrackFile[],
  callbacks: ProcessCallbacks<T>,
  options?: {
    failAtStep?: number;
    stepDelayMs?: number;
  }
): ProcessController {
  const total = files.length > 0 ? files.length : 1;
  let currentIndex = 0;
  let isCancelled = false;
  let isPaused = false;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  const delay = options?.stepDelayMs ?? 550;

  function getStepResult(kindName: string) {
    switch (kindName) {
      case "classifier":
        return INITIAL_CLASSIFIER_RESULTS.slice(0, files.length) as unknown as T;
      case "sets":
        return INITIAL_SET_RESULTS.slice(0, files.length) as unknown as T;
      case "converter":
        return INITIAL_CONVERTER_RESULTS.slice(0, files.length) as unknown as T;
      case "metadata":
        return INITIAL_METADATA_RESULTS.slice(0, files.length) as unknown as T;
      case "bpm":
        return INITIAL_BPM_RESULTS.slice(0, files.length) as unknown as T;
      case "stems":
        return {
          ...INITIAL_STEMS_RESULT,
          sourceFile: files[0]?.filename || INITIAL_STEMS_RESULT.sourceFile,
        } as unknown as T;
      default:
        return [] as unknown as T;
    }
  }

  function step() {
    if (isCancelled) return;
    if (isPaused) return;

    if (options?.failAtStep && currentIndex + 1 === options.failAtStep) {
      const errTrack = files[currentIndex]?.filename || "stream_error.tmp";
      callbacks.onError(`[ERROR:500] Critical read failure on "${errTrack}"`);
      return;
    }

    if (currentIndex >= total) {
      const finalResult = getStepResult(kind);
      callbacks.onResult(finalResult);
      return;
    }

    const currentFile = files[currentIndex]?.filename || `track_${currentIndex + 1}.mp3`;
    const stepNumber = currentIndex + 1;
    const percent = Math.round((stepNumber / total) * 100);
    const logLine = `[PROGRESS:${stepNumber}/${total}] Processing: ${currentFile}`;

    callbacks.onProgress({
      current: stepNumber,
      total,
      filename: currentFile,
      logLine,
      percent,
    });

    currentIndex++;
    timerId = setTimeout(step, delay);
  }

  timerId = setTimeout(step, 100);

  return {
    cancel() {
      isCancelled = true;
      if (timerId) clearTimeout(timerId);
    },
    pause() {
      isPaused = true;
      if (timerId) clearTimeout(timerId);
    },
    resume() {
      if (isPaused && !isCancelled) {
        isPaused = false;
        timerId = setTimeout(step, 150);
      }
    },
  };
}
