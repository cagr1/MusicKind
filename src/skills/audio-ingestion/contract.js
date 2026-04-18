/**
 * @typedef {Object} AudioIngestionInput
 * @property {string=} target Ruta unica (archivo o carpeta).
 * @property {string[]=} targets Varias rutas para procesamiento batch.
 * @property {boolean=} dryRun Si es true, no realiza escrituras (solo simulacion).
 * @property {boolean=} recursive Si es true, explora subcarpetas. Default: true.
 * @property {boolean=} includeHidden Si es true, incluye archivos ocultos. Default: false.
 * @property {boolean=} collectMetadata Si es true, lee metadata/duracion. Default: true.
 * @property {string[]=} supportedExtensions Lista de extensiones permitidas.
 * @property {"music-metadata"|"ffprobe"=} metadataAdapter Adapter a usar para metadata.
 * @property {Object=} ffprobeOptions Opciones del adapter ffprobe.
 * @property {string=} ffprobeOptions.ffprobePath Binario de ffprobe. Default: "ffprobe".
 */

/**
 * @typedef {Object} AudioManifestEntry
 * @property {string} id Hash estable del archivo.
 * @property {Object} path
 * @property {string} path.absolute Ruta absoluta normalizada.
 * @property {string} path.portable Ruta normalizada con '/'.
 * @property {string} path.name Nombre de archivo.
 * @property {string} path.directory Carpeta contenedora (portable).
 * @property {string} path.extension Extension en minuscula.
 * @property {number|null} sizeBytes Tamano en bytes.
 * @property {number|null} durationSeconds Duracion en segundos.
 * @property {Object} format
 * @property {string} format.detectedBy Adapter usado.
 * @property {string|null} format.container Contenedor detectado.
 * @property {string|null} format.codec Codec detectado.
 * @property {number|null} format.sampleRate Frecuencia de muestreo.
 * @property {number|null} format.bitrate Bitrate.
 * @property {"ready"|"dry-run"|"error"} status Estado del archivo en el manifest.
 * @property {{code: string, message: string}=} error Error por archivo si aplica.
 */

/**
 * @typedef {Object} AudioIngestionResult
 * @property {boolean} ok
 * @property {string} startedAt
 * @property {string|null} finishedAt
 * @property {boolean} dryRun
 * @property {Object} manifest
 * @property {string} manifest.version
 * @property {string} manifest.generatedAt
 * @property {AudioManifestEntry[]} manifest.files
 * @property {{path: string, reason: string, message: string}[]} manifest.ignored
 * @property {Object} summary
 * @property {number} summary.targetsReceived
 * @property {number} summary.targetsResolved
 * @property {number} summary.filesDiscovered
 * @property {number} summary.supportedFiles
 * @property {number} summary.ignoredFiles
 * @property {number} summary.errors
 * @property {{code: string, message: string, target: string|null, path: string|null, details: Object|null}[]} errors
 * @property {{code: string, message: string, details?: Object}[]} warnings
 */

export const AUDIO_INGESTION_CONTRACT_VERSION = "1.0";
