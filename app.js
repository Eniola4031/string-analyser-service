const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware to parse JSON bodies
app.use(express.json());

// --- In-Memory Data Store ---
// Stores computed string properties, keyed by the RAW STRING VALUE.
const stringStore = {};

// --- Utility Functions for String Analysis ---

/**
 * Computes all required properties for a given string value.
 * @param {string} value - The input string.
 * @returns {object} The complete analysis object including properties and the hash.
 */
function analyzeString(value) {
  const properties = {};
  const lowerCaseValue = value.toLowerCase();

  // 1. Length
  properties.length = value.length;

  // 2. SHA-256 Hash (Used as the ID)
  properties.sha256_hash = crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");

  // 3. Palindrome Check (Case-insensitive, ignoring non-alphanumeric for robustness)
  const sanitizedString = lowerCaseValue.replace(/[^a-z0-9]/g, "");
  const reversedString = sanitizedString.split("").reverse().join("");
  properties.is_palindrome =
    sanitizedString === reversedString && sanitizedString.length > 0;

  // 4. Character Frequency Map (Case-sensitive)
  properties.character_frequency_map = {};
  for (const char of value) {
    properties.character_frequency_map[char] =
      (properties.character_frequency_map[char] || 0) + 1;
  }

  // 5. Unique Characters Count
  properties.unique_characters = Object.keys(
    properties.character_frequency_map
  ).length;

  // 6. Word Count (Splitting by common whitespace)
  const wordMatches = value.match(/\S+/g);
  properties.word_count = wordMatches ? wordMatches.length : 0;

  return {
    id: properties.sha256_hash,
    value: value,
    properties: properties,
    created_at: new Date().toISOString(),
  };
}

/**
 * Parses a natural language query into formal filter parameters.
 * NOTE: This is a simplified keyword parser and not a true NLP engine.
 * @param {string} query - The natural language input string.
 * @returns {object} An object containing parsed filters or null if unparsable.
 */
function parseNaturalLanguage(queryRaw) {
  const q = String(queryRaw || "")
    .toLowerCase()
    .trim();
  if (!q) return {};

  const filters = {};

  // palindromes
  if (/\bpalindrome|palindromic\b/.test(q)) {
    filters.is_palindrome = true;
  }

  // single word
  if (/\b(single|one)\s+word\b/.test(q)) {
    filters.word_count = 1;
  }

  // contains character: "contains the letter a" / "contains character z" / "strings containing the letter z"
  const containsChar = q.match(
    /(?:contains|containing|has|with)\s+(?:the\s+)?(?:letter|character)\s*([a-z0-9])/
  );
  if (containsChar) {
    filters.contains_character = containsChar[1];
  }

  // "first vowel" heuristic -> 'a'
  if (/\bfirst\s+vowel\b/.test(q)) {
    filters.contains_character = "a";
  }

  // longer/greater than N -> min_length = N+1
  const longer = q.match(/\b(longer|greater)\s+than\s+(\d+)\b/);
  if (longer) {
    filters.min_length = parseInt(longer[2], 10) + 1;
  }

  // shorter/less than N -> max_length = N-1
  const shorter = q.match(/\b(shorter|less)\s+than\s+(\d+)\b/);
  if (shorter) {
    filters.max_length = parseInt(shorter[2], 10) - 1;
  }

  // exactly N characters -> min=max=N (optional but handy)
  const exactly = q.match(/\b(?:exactly|of)\s+(\d+)\s+characters?\b/);
  if (exactly) {
    const n = parseInt(exactly[1], 10);
    filters.min_length = n;
    filters.max_length = n;
  }

  // conflict check
  if (
    filters.min_length !== undefined &&
    filters.max_length !== undefined &&
    filters.min_length > filters.max_length
  ) {
    return { error: "conflict" };
  }

  return filters;
}

function applyFilters(data, filters) {
  let results = data;

  // is_palindrome (Boolean filter)
  if (filters.is_palindrome !== undefined) {
    const isPalindrome = String(filters.is_palindrome).toLowerCase() === "true";
    results = results.filter(
      (item) => item.properties.is_palindrome === isPalindrome
    );
  }

  // min_length (Integer filter)
  if (filters.min_length !== undefined) {
    const minLength = parseInt(filters.min_length, 10);
    if (!isNaN(minLength)) {
      results = results.filter((item) => item.properties.length >= minLength);
    }
  }

  // max_length (Integer filter)
  if (filters.max_length !== undefined) {
    const maxLength = parseInt(filters.max_length, 10);
    if (!isNaN(maxLength)) {
      results = results.filter((item) => item.properties.length <= maxLength);
    }
  }

  // word_count (Integer filter)
  if (filters.word_count !== undefined) {
    const wordCount = parseInt(filters.word_count, 10);
    if (!isNaN(wordCount)) {
      results = results.filter(
        (item) => item.properties.word_count === wordCount
      );
    }
  }

  // contains_character (String filter)
  if (filters.contains_character) {
    const char = String(filters.contains_character);
    results = results.filter((item) =>
      item.value.toLowerCase().includes(char.toLowerCase())
    );
  }

  return results;
}

// --- API Endpoints ---

// 1. Create/Analyze String
app.post("/strings", (req, res) => {
  const value = req.body.value;

  // 400 Bad Request: Missing "value" field
  if (value === undefined) {
    return res
      .status(400)
      .json({ error: 'Bad Request: Missing "value" field in request body.' });
  }

  // 422 Unprocessable Entity: Invalid data type
  if (typeof value !== "string") {
    return res
      .status(422)
      .json({ error: 'Unprocessable Entity: "value" must be a string.' });
  }

  // Trim and handle empty string gracefully
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return res.status(422).json({
      error: 'Unprocessable Entity: "value" cannot be an empty string.',
    });
  }

  const analysisResult = analyzeString(trimmedValue);

  // 409 Conflict: String already exists
  // HIGHLIGHT: Checking existence by value, which is now the key.
  if (stringStore[trimmedValue]) {
    return res.status(409).json({
      error: "Conflict: This string has already been analyzed and stored.",
    });
  }

  // Store the result
  // HIGHLIGHT: Storing the result using the raw string value as the key.
  stringStore[trimmedValue] = analysisResult;

  // 201 Created Response
  res.status(201).json(analysisResult);
});

// 2. Natural Language Filtering
app.get("/strings/filter-by-natural-language", (req, res) => {
  const q = req.query.query;
  if (typeof q !== "string" || !q.trim()) {
    return res.status(400).json({
      error:
        'Bad Request: Missing "query" parameter for natural language filtering.',
    });
  }

  const parsedFilters = parseNaturalLanguage(q);

  if (parsedFilters && parsedFilters.error === "conflict") {
    return res.status(422).json({
      error:
        "Unprocessable Entity: Query parsed but resulted in conflicting filters.",
      interpreted_query: { original: q, parsed_filters: {} },
    });
  }

  if (!parsedFilters || Object.keys(parsedFilters).length === 0) {
    return res.status(400).json({
      error: "Bad Request: Unable to parse natural language query.",
      interpreted_query: { original: q, parsed_filters: {} },
    });
  }

  const availableData = Object.values(stringStore);
  const filteredData = applyFilters(availableData, parsedFilters);

  return res.status(200).json({
    data: filteredData,
    count: filteredData.length,
    interpreted_query: {
      original: q,
      parsed_filters: parsedFilters,
    },
  });
});

// 3. Get Specific String
// HIGHLIGHT: Route changed from :hash to :value
app.get("/strings/:value", (req, res) => {
  // HIGHLIGHT: Using req.params.value for lookup
  const value = req.params.value;

  // NOTE: Express automatically decodes the URL component before reaching here.

  const stringData = stringStore[value];

  // 404 Not Found
  // HIGHLIGHT: The 404 block is still correct, checking if the value exists as a key.
  if (!stringData) {
    return res.status(404).json({
      error:
        "Not Found: String analysis for the provided value does not exist.",
    });
  }

  // 200 OK
  res.status(200).json(stringData);
});

// 4. Get All Strings with Filtering
app.get("/strings", (req, res) => {
  const availableData = Object.values(stringStore);

  // Check for bad request parameters (simple check for non-numeric/non-boolean type mismatch)
  const {
    is_palindrome,
    min_length,
    max_length,
    word_count,
    contains_character,
  } = req.query;

  if (
    is_palindrome !== undefined &&
    !["true", "false"].includes(String(is_palindrome).toLowerCase())
  ) {
    return res
      .status(400)
      .json({ error: 'Bad Request: is_palindrome must be "true" or "false".' });
  }

  // Helper function to check if query parameter is present and not a valid integer
  const isInvalidInt = (val) => val !== undefined && isNaN(parseInt(val, 10));

  if (
    isInvalidInt(min_length) ||
    isInvalidInt(max_length) ||
    isInvalidInt(word_count)
  ) {
    return res.status(400).json({
      error:
        "Bad Request: Length and word count filters must be valid integers.",
    });
  }

  // Apply the filters
  const filteredData = applyFilters(availableData, req.query);

  // 200 OK Response
  res.status(200).json({
    data: filteredData,
    count: filteredData.length,
    filters_applied: req.query,
  });
});

// 5. Delete String
// HIGHLIGHT: Route changed from :hash to :value
app.delete("/strings/:value", (req, res) => {
  // HIGHLIGHT: Using req.params.value for lookup and deletion
  const value = req.params.value;

  // 404 Not Found
  if (!stringStore[value]) {
    return res.status(404).json({
      error:
        "Not Found: String analysis for the provided value does not exist.",
    });
  }

  // Delete from store
  delete stringStore[value];

  // 204 No Content
  res.status(204).send();
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`String Analysis API running on port ${PORT}`);
  console.log(`Local endpoints available at http://localhost:${PORT}`);
  console.log(
    "NOTE: GET and DELETE routes now use the full URL-encoded string value as the path parameter."
  );
});
