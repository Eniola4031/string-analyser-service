const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware to parse JSON bodies
app.use(express.json());

// --- In-Memory Data Store ---
// Stores computed string properties, keyed by the SHA-256 hash.
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
    properties.sha256_hash = crypto.createHash('sha256').update(value).digest('hex');

    // 3. Palindrome Check (Case-insensitive, ignoring non-alphanumeric for robustness)
    const sanitizedString = lowerCaseValue.replace(/[^a-z0-9]/g, '');
    const reversedString = sanitizedString.split('').reverse().join('');
    properties.is_palindrome = sanitizedString === reversedString && sanitizedString.length > 0;

    // 4. Character Frequency Map (Case-sensitive)
    properties.character_frequency_map = {};
    for (const char of value) {
        properties.character_frequency_map[char] = (properties.character_frequency_map[char] || 0) + 1;
    }

    // 5. Unique Characters Count
    properties.unique_characters = Object.keys(properties.character_frequency_map).length;

    // 6. Word Count (Splitting by common whitespace)
    const wordMatches = value.match(/\S+/g);
    properties.word_count = wordMatches ? wordMatches.length : 0;

    return {
        id: properties.sha256_hash,
        value: value,
        properties: properties,
        created_at: new Date().toISOString()
    };
}

/**
 * Parses a natural language query into formal filter parameters.
 * NOTE: This is a simplified keyword parser and not a true NLP engine.
 * @param {string} query - The natural language input string.
 * @returns {object} An object containing parsed filters or null if unparsable.
 */
function parseNaturalLanguage(query) {
    const filters = {};
    const q = query.toLowerCase();

    // Palindrome filter
    if (q.includes('palindrome') || q.includes('palindromic')) {
        filters.is_palindrome = true;
    }

    // Word Count filter
    if (q.includes('single word')) {
        filters.word_count = 1;
    }

    // Contains Character filter
    const containsMatch = q.match(/contains the letter (\w)|contains character (\w)|has the letter (\w)|with character (\w)/);
    if (containsMatch && containsMatch[1]) {
        filters.contains_character = containsMatch[1];
    }

    // Length filters (min/max)
    const lengthMatch = q.match(/(longer|shorter|greater|less) than (\d+)/);
    if (lengthMatch) {
        const type = lengthMatch[1];
        const number = parseInt(lengthMatch[2], 10);

        if (['longer', 'greater'].includes(type)) {
            // longer than 10 means min_length is 11
            filters.min_length = number + 1; 
        } else if (['shorter', 'less'].includes(type)) {
            // shorter than 10 means max_length is 9
            filters.max_length = number - 1;
        }
    }
    
    // Check for conflicting filters (simple check)
    if (filters.min_length !== undefined && filters.max_length !== undefined && filters.min_length > filters.max_length) {
        // Return a special code to trigger 422
        return { error: 'Conflicting Length Filters' };
    }

    return filters;
}

/**
 * Applies a set of filter parameters to the array of string data.
 * @param {Array<object>} data - The full array of string analysis objects.
 * @param {object} filters - The parsed query filters.
 * @returns {Array<object>} The filtered array.
 */
function applyFilters(data, filters) {
    let results = data;

    // is_palindrome (Boolean filter)
    if (filters.is_palindrome !== undefined) {
        const isPalindrome = String(filters.is_palindrome).toLowerCase() === 'true';
        results = results.filter(item => item.properties.is_palindrome === isPalindrome);
    }

    // min_length (Integer filter)
    if (filters.min_length !== undefined) {
        const minLength = parseInt(filters.min_length, 10);
        if (!isNaN(minLength)) {
            results = results.filter(item => item.properties.length >= minLength);
        }
    }

    // max_length (Integer filter)
    if (filters.max_length !== undefined) {
        const maxLength = parseInt(filters.max_length, 10);
        if (!isNaN(maxLength)) {
            results = results.filter(item => item.properties.length <= maxLength);
        }
    }

    // word_count (Integer filter)
    if (filters.word_count !== undefined) {
        const wordCount = parseInt(filters.word_count, 10);
        if (!isNaN(wordCount)) {
            results = results.filter(item => item.properties.word_count === wordCount);
        }
    }

    // contains_character (String filter)
    if (filters.contains_character) {
        const char = String(filters.contains_character);
        results = results.filter(item => item.value.toLowerCase().includes(char.toLowerCase()));
    }

    return results;
}

// --- API Endpoints ---

// 1. Create/Analyze String
app.post('/strings', (req, res) => {
    const value = req.body.value;

    // 400 Bad Request: Missing "value" field
    if (value === undefined) {
        return res.status(400).json({ error: 'Bad Request: Missing "value" field in request body.' });
    }

    // 422 Unprocessable Entity: Invalid data type
    if (typeof value !== 'string') {
        return res.status(422).json({ error: 'Unprocessable Entity: "value" must be a string.' });
    }
    
    // Trim and handle empty string gracefully
    const trimmedValue = value.trim();
    if (trimmedValue.length === 0) {
        return res.status(422).json({ error: 'Unprocessable Entity: "value" cannot be an empty string.' });
    }

    const analysisResult = analyzeString(trimmedValue);

    // 409 Conflict: String already exists
    if (stringStore[analysisResult.id]) {
        return res.status(409).json({ error: 'Conflict: This string has already been analyzed and stored.' });
    }

    // Store the result
    stringStore[analysisResult.id] = analysisResult;

    // 201 Created Response
    res.status(201).json(analysisResult);
});

// 2. Get Specific String
// NOTE: Using the SHA-256 hash (id) as the path parameter is best practice for unique identification.
app.get('/strings/:hash', (req, res) => {
    const hash = req.params.hash;
    const stringData = stringStore[hash];

    // 404 Not Found
    if (!stringData) {
        return res.status(404).json({ error: 'Not Found: String analysis with the provided ID does not exist.' });
    }

    // 200 OK
    res.status(200).json(stringData);
});

// 3. Get All Strings with Filtering
app.get('/strings', (req, res) => {
    const availableData = Object.values(stringStore);
    
    // Check for bad request parameters (simple check for non-numeric/non-boolean type mismatch)
    const { is_palindrome, min_length, max_length, word_count, contains_character } = req.query;

    if (is_palindrome !== undefined && !['true', 'false'].includes(String(is_palindrome).toLowerCase())) {
        return res.status(400).json({ error: 'Bad Request: is_palindrome must be "true" or "false".' });
    }
    
    // Helper function to check if query parameter is present and not a valid integer
    const isInvalidInt = (val) => val !== undefined && isNaN(parseInt(val, 10));

    if (isInvalidInt(min_length) || isInvalidInt(max_length) || isInvalidInt(word_count)) {
        return res.status(400).json({ error: 'Bad Request: Length and word count filters must be valid integers.' });
    }

    // Apply the filters
    const filteredData = applyFilters(availableData, req.query);
    
    // 200 OK Response
    res.status(200).json({
        data: filteredData,
        count: filteredData.length,
        filters_applied: req.query
    });
});

// 4. Natural Language Filtering
app.get('/strings/filter-by-natural-language', (req, res) => {
    const query = req.query.query;

    if (!query) {
        return res.status(400).json({ error: 'Bad Request: Missing "query" parameter for natural language filtering.' });
    }

    const parsedFilters = parseNaturalLanguage(query);
    
    if (parsedFilters.error) {
        // 422 Unprocessable Entity: Conflicting filters from parser
         return res.status(422).json({ 
            error: 'Unprocessable Entity: Query parsed but resulted in conflicting filters (e.g., min length greater than max length).',
            interpreted_query: { original: query, parsed_filters: {} }
         });
    }

    if (Object.keys(parsedFilters).length === 0) {
        // 400 Bad Request: Unable to parse anything meaningful
        return res.status(400).json({ 
            error: 'Bad Request: Unable to parse natural language query. Try a different phrasing.',
            interpreted_query: { original: query, parsed_filters: {} }
        });
    }

    const availableData = Object.values(stringStore);
    const filteredData = applyFilters(availableData, parsedFilters);

    // 200 OK Response
    res.status(200).json({
        data: filteredData,
        count: filteredData.length,
        interpreted_query: {
            original: query,
            parsed_filters: parsedFilters
        }
    });
});

// 5. Delete String
app.delete('/strings/:hash', (req, res) => {
    const hash = req.params.hash;

    // 404 Not Found
    if (!stringStore[hash]) {
        return res.status(404).json({ error: 'Not Found: String analysis with the provided ID does not exist.' });
    }

    // Delete from store
    delete stringStore[hash];

    // 204 No Content
    res.status(204).send();
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`String Analysis API running on port ${PORT}`);
    console.log(`Local endpoints available at http://localhost:${PORT}`);
});