# string-analyser-service
Stage 1 Task: Build a String Analyzer Service
Welcome to Stage 1! :dart:
Build a RESTful API service that analyzes strings and stores their computed properties.
Explainer video
What it should do
For each analyzed string, compute and store the following properties:
length: Number of characters in the string
is_palindrome: Boolean indicating if the string reads the same forwards and backwards (case-insensitive)
unique_characters: Count of distinct characters in the string
word_count: Number of words separated by whitespace
sha256_hash: SHA-256 hash of the string for unique identification
character_frequency_map: Object/dictionary mapping each character to its occurrence count
The endpoints you’re building
1. Create/Analyze String
POST /strings
Content-Type: application/json
Request Body:
{
  "value": "string to analyze"
}
Success Response (201 Created):
{
  "id": "sha256_hash_value",
  "value": "string to analyze",
  "properties": {
    "length": 16,
    "is_palindrome": false,
    "unique_characters": 12,
    "word_count": 3,
    "sha256_hash": "abc123...",
    "character_frequency_map": {
      "s": 2,
      "t": 3,
      "r": 2,
      // ... etc
    }
  },
  "created_at": "2025-08-27T10:00:00Z"
}
Error Responses:
409 Conflict: String already exists in the system
400 Bad Request: Invalid request body or missing "value" field
422 Unprocessable Entity: Invalid data type for "value" (must be string)
2. Get Specific String
GET /strings/{string_value}
Success Response (200 OK):
{
  "id": "sha256_hash_value",
  "value": "requested string",
  "properties": { /* same as above */ },
  "created_at": "2025-08-27T10:00:00Z"
}
Error Responses:
404 Not Found: String does not exist in the system
3. Get All Strings with Filtering
GET /strings?is_palindrome=true&min_length=5&max_length=20&word_count=2&contains_character=a
Success Response (200 OK):
{
  "data": [
    {
      "id": "hash1",
      "value": "string1",
      "properties": { /* ... */ },
      "created_at": "2025-08-27T10:00:00Z"
    },
    // ... more strings
  ],
  "count": 15,
  "filters_applied": {
    "is_palindrome": true,
    "min_length": 5,
    "max_length": 20,
    "word_count": 2,
    "contains_character": "a"
  }
}
Query Parameters:
is_palindrome: boolean (true/false)
min_length: integer (minimum string length)
max_length: integer (maximum string length)
word_count: integer (exact word count)
contains_character: string (single character to search for)
Error Response:
400 Bad Request: Invalid query parameter values or types
4. Natural Language Filtering
GET /strings/filter-by-natural-language?query=all%20single%20word%20palindromic%20strings
Success Response (200 OK):
{
  "data": [ /* array of matching strings */ ],
  "count": 3,
  "interpreted_query": {
    "original": "all single word palindromic strings",
    "parsed_filters": {
      "word_count": 1,
      "is_palindrome": true
    }
  }
}
Example Queries to Support:
"all single word palindromic strings" → word_count=1, is_palindrome=true
"strings longer than 10 characters" → min_length=11
"palindromic strings that contain the first vowel" → is_palindrome=true, contains_character=a (or similar heuristic)
"strings containing the letter z" → contains_character=z
Error Response:
400 Bad Request : Unable to parse natural language query
422 Unprocessable Entity :Query parsed but resulted in conflicting filters
5. Delete String
DELETE /strings/{string_value}
Success Response (204 No Content): (Empty response body)
Error Responses:
404 Not Found: String does not exist in the system
Submission instructions
You can implement this in any language of your choice (eg Fortran, C, Assembly etc)
Host the API: Vercel is forbidden this cohort, and no Render, other options like (Railway, Heroku, AWS, PXXL App etc.) are accepted.
Include the GitHub repo link with:
Clear README with setup instructions
Instructions to run locally
List of dependencies and how to install them
Environment variables needed (if any)
Test your endpoint before submission — ensure it returns the correct response format
Provide any relevant tests, API documentation, or notes in the repo
Submission: #IMPORTANT
For your submission, make use of the bot in the stage-1-backend channel by entering /stage-one-backend in the channel and submitting in the requested URLs.
:drawing_pin: Submission Process
Verify your server works (test from multiple networks if possible)
Go to the stage-1-backend channel in Slack
Run the command:  /stage-one-backend
Submit:
Your API base URL (https://yourapp.domain.app)
Your GitHub repo link
Your full name
Your email
Stack
 5.  Please check Thanos bot to see the error message or success message after each attempt.
Submission Deadline: Deadline: Wednesday, 22th Oct 2025 | 11:59pm GMT+1 (WAT)
