import { createPrefixedIdRegex } from '../shared/random/ids.constants.models';

export const DOCUMENT_ID_PREFIX = 'doc';
export const DOCUMENT_ID_REGEX = createPrefixedIdRegex({ prefix: DOCUMENT_ID_PREFIX });

export const ORIGINAL_DOCUMENTS_STORAGE_KEY = 'originals';

// When uploading a formdata multipart, the body has boundaries and other metadata that need to be accounted for
export const MULTIPART_FORM_DATA_SINGLE_FILE_CONTENT_LENGTH_OVERHEAD = 1024; // 1024 bytes
