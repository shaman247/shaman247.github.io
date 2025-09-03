/**
 * Configuration
 */
const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY_HERE';

// --- Sheet Configuration ---
const URL_COLUMN = 5;        // Column number for URLs (A=1, B=2, etc.)
const OUTPUT_COLUMN = 7;     // Column number for Gemini output (A=1, B=2, etc.)
const DATE_COLUMN = 8;       // Column number for current date (A=1, B=2, etc.)
const INPUT_PARSED_URL_COLUMN = OUTPUT_COLUMN;
const OUTPUT_TSV_COLUMN = 9;
const TSV_DATE_COLUMN = 10;
const NUM_EVENTS_FOUND_COLUMN = 11;

const START_ROW = 3;         // Row number to start processing from (to skip headers, for example)
const MAX_ROWS_TO_PROCESS = 500; // Maximum number of URLs to process in a single run.
const MAX_CELL_CHARACTERS = 49999; // Max characters for a single Google Sheet cell.

function getPrompt(url, pageContent, currentDateString, name, notes) {
  // Truncate pageContent if it's too long to avoid exceeding API token limits.
  const MAX_CONTENT_LENGTH = 100000;
  let truncatedContent = pageContent;
  if (pageContent.length > MAX_CONTENT_LENGTH) {
    truncatedContent = pageContent.substring(0, MAX_CONTENT_LENGTH) + "... (content truncated)";
  }

  return `Today's date is ${currentDateString}. We are assembling a database of upcoming events in New York City. To accomplish this, we are inspecting websites for details about upcoming events. Currently, we are looking at ${name} (${url}). Based on the text content retrieved from the website ${url}, please identify and list any upcoming events. If possible, include dates, times, locations, and descriptions (1-2 sentences) for each event. Format your output as a Markdown table with the following header:
  
  | name | location | sublocation | start_date | start_time | end_date | end_time | description | url | hashtags | emoji |

  Some pointers about these fields:

- "name" is the name of the event
- "location" is the name of the venue where the event is being held
- "sublocation" is optional and can be used to specify locations within the venue (e.g., rooftop, 5th floor, etc.)
- "start_date" is the date of the event in YYYY-MM-DD format.
- "start_time" is the time of the event (e.g., 4:00 PM)
- "end_date" and "end_time" are optional
- "url" should be ${url}
- "description" should be 1-2 sentences.
- "hashtags" are a set of 3-6 tags to describe the event. Include a mix of high-level tags (e.g., #Comedy, #LiveMusic, #Outdoor) and more granular tags (e.g., #LatinJazz, #Ceramics, #Vegan). Avoid tags that are specific to a location or neighborhood. 
- "emoji" is a single emoji that describes the event.

Output up to 50 rows for any events that are present in the content below, which has been retrieved from the website. If no events were successfully retrieved, output an empty header. Only include events that take place in the NYC area. If an event has multiple dates or times, output a separate row for each instance. Use Google Search to verify correctness and add details where appropriate.

${notes ? "Note: " + notes : ""}

Here is the content:

${truncatedContent}`;
}



// --- Prompt Configuration ---
// Customize this function to create the prompt you want to send to Gemini.
// It now takes the URL and the fetched page content as input.
function getCustomPrompt(url, pageContent, currentDateString) {
  // Truncate pageContent if it's too long to avoid exceeding API token limits.
  const MAX_CONTENT_LENGTH = 100000;
  let truncatedContent = pageContent;
  if (pageContent.length > MAX_CONTENT_LENGTH) {
    truncatedContent = pageContent.substring(0, MAX_CONTENT_LENGTH) + "... (content truncated)";
  }

  return `Today's date is ${currentDateString}. We are assembling a database of upcoming events in New York City. To accomplish this, we are scraping websites for details about upcoming events. Based on the following text content scraped from the website ${url}, please identify and list up to 25 upcoming events. If possible, include dates, times, locations, and descriptions (1-2 sentences) for each event. If no events are found, please state that.
  
  Content: ${truncatedContent}`;
}

function getTSVPrompt(currentDateString, location, address, latitude, longitude, website, notes, parsedEvents) {
  return `Today's date is ${currentDateString}. We are assembling a database of upcoming events in New York City. To accomplish this, we have scraped websites for details about upcoming events. Your job is to output a Markdown table for any events that were found. The Markdown table must have the following fields in the header:

name location address latitude longitude start_date start_time end_date end_time description url hashtags

Some pointers about these fields:

- "start_date" is the date of the event in YYYY-MM-DD format.
- "start_time" is the time of the event (e.g., 4:00 PM)
- "end_date" and "end_time" are optional
- "location", "address", "url", "latitude", and "longitude" have already been provided for you. Use them, unless the event text specifies a different location.
- "description" should be 1-2 sentences.
- "hashtags" are a set of 3-6 tags to describe the event. Include a mix of high-level tags (e.g., #Comedy, #LiveMusic, #Outdoor) and more granular tags (e.g., #LatinJazz, #Ceramics, #Vegan). Avoid tags that are specific to a location or neighborhood. 

The website we scraped, ${website}, is associated with the following location:

Location: ${location}
Address: ${address}
Latitude: ${latitude}
Longitude: ${longitude}
URL: ${website}

Output up to 50 rows for any events that are present in the content below, which has been scraped from the website. If no events were successfully scraped, output an empty header. Only include events that take place in the NYC area. If an event has multiple dates or times, output a separate row for each instance. Here is the scraped content:

${parsedEvents}

Your output MUST be valid Markdown with the header: | name | location | address | latitude | longitude | start_date | start_time | end_date | end_time | description | url | hashtags |

Use Google Search to verify correctness and add details where appropriate.
`;
}

function getGeminiOutput(geminiResponseBody) {
  const jsonResponse = JSON.parse(geminiResponseBody);
  if (jsonResponse.candidates && jsonResponse.candidates.length > 0 &&
      jsonResponse.candidates[0].content && jsonResponse.candidates[0].content.parts &&
      jsonResponse.candidates[0].content.parts.length > 0) {
    geminiOutput = jsonResponse.candidates[0].content.parts[0].text;
    if (geminiOutput != undefined) { return geminiOutput; }
    for (let i = jsonResponse.candidates[0].content.parts.length-1; i >= 0; i--) {
      geminiOutput = jsonResponse.candidates[0].content.parts[i].text;
      if (geminiOutput != undefined) { return geminiOutput; }
    }
    ui.alert(JSON.stringify(geminiOutput));
    return "Undefined response";
  } else if (jsonResponse.promptFeedback && jsonResponse.promptFeedback.blockReason) {
      geminiOutput = `Blocked by Gemini: ${jsonResponse.promptFeedback.blockReason}`;
      if(jsonResponse.promptFeedback.blockReasonMessage) {
            geminiOutput += ` - ${jsonResponse.promptFeedback.blockReasonMessage}`;
      }
      return geminiOutput;
  }

  return "No content found in Gemini response.";
}

// --- Gemini API Configuration ---
const DATE_FORMAT = 'yyyy-MM-dd'; // You can change this format as needed

const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

function getGeminiOptions(prompt) {
  const payload = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    tools: [{
      //googleSearchRetrieval: {}
    }, {
      codeExecution: {}
    }, {
      googleSearch: {}
    }, {
      //urlContext: {}
    }],
    generationConfig: {
      thinkingConfig: {
        includeThoughts: false,
        thinkingBudget: 0
      },
      temperature: 0.0
    }
  };
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  return options;
}

/**
 * Main function to process URLs, fetch their content, and call Gemini API.
 */
function processURLs() {
  const ui = SpreadsheetApp.getUi();
  if (GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE' || GEMINI_API_KEY.trim() === '') {
    ui.alert('API Key Missing', 'Please replace "YOUR_GEMINI_API_KEY_HERE" in the script with your actual Gemini API key.', ui.ButtonSet.OK);
    return;
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < START_ROW) {
    ui.alert('Info', 'No data to process in the specified range.', ui.ButtonSet.OK);
    return;
  }

  // Dynamically find column indices based on headers in row 2.
  const headerRow = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
  const headers = headerRow.map(h => h.toString().trim());

  const websiteColIdx = headers.indexOf("website");
  const urlColIdx = headers.indexOf("url");
  const notesColIdx = headers.indexOf("notes");
  const eventsColIdx = headers.indexOf("events");
  const readDateColIdx = headers.indexOf("read_date");

  const requiredCols = { "website": websiteColIdx, "url": urlColIdx, "notes": notesColIdx, "eventsColIdx": eventsColIdx, "read_date": readDateColIdx };
  const missingCols = Object.keys(requiredCols).filter(key => requiredCols[key] === -1);

  if (missingCols.length > 0) {
    ui.alert('Error: Missing Columns', `Could not find required columns: ${missingCols.join(', ')}. Please check your headers on row 2.`, ui.ButtonSet.OK);
    return;
  }
  
  const numRowsToProcess = lastRow - START_ROW + 1;
  const dataRange = sheet.getRange(START_ROW, 1, numRowsToProcess, sheet.getLastColumn());
  const data = dataRange.getValues();

  let processedCount = 0;
  let skippedCount = 0;
  let limitReached = false;
  const timeZone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const currentDateString = Utilities.formatDate(new Date(), timeZone, "MMMM d, yyyy");

  for (let i = 0; i < data.length; i++) {
    if (processedCount >= MAX_ROWS_TO_PROCESS) {
      Logger.log(`Reached processing limit of ${MAX_ROWS_TO_PROCESS}. Stopping.`);
      limitReached = true;
      break;
    }

    const rowData = data[i];
    const currentRowInSheet = START_ROW + i;
    const currentUrl = rowData[urlColIdx];
    const outputCellContent = rowData[eventsColIdx];
    const name = rowData[websiteColIdx];
    const notes = rowData[notesColIdx];
    const readDateValue = rowData[readDateColIdx];

    if (!currentUrl || currentUrl.toString().trim() === '') {
      Logger.log(`Skipping row ${currentRowInSheet} because URL is empty.`);
      skippedCount++;
      continue;
    }

    if (outputCellContent && outputCellContent.toString().trim() !== '') {
      if (readDateValue && readDateValue instanceof Date) {
        const today = new Date();
        const readDate = new Date(readDateValue);
        const fourDaysInMillis = 4 * 24 * 60 * 60 * 1000;
        if ((today.getTime() - readDate.getTime()) <= fourDaysInMillis) {
          Logger.log(`Skipping URL ${currentUrl} as output cell already has content and is recent (less than 4 days old).`);
          skippedCount++;
          continue;
        } else {
           Logger.log(`Re-processing URL ${currentUrl} because read_date is older than 4 days.`);
        }
      } else {
         Logger.log(`Re-processing URL ${currentUrl} because read_date is empty or invalid.`);
      }
    }

    sheet.getRange('A1').setValue(`Processing URL for ${name}`);
    SpreadsheetApp.flush();

    try {
      let pageContent = '';
      let fetchErrorMessage = '';
      try {
        const urlResponse = UrlFetchApp.fetch(currentUrl, { muteHttpExceptions: true, validateHttpsCertificates: false });
        const urlResponseCode = urlResponse.getResponseCode();
        if (urlResponseCode === 200) {
          pageContent = urlResponse.getContentText();
          pageContent = pageContent.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
          pageContent = pageContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
          pageContent = pageContent.replace(/<[^>]+>/g, ' ');
          pageContent = pageContent.replace(/\s+/g, ' ').trim();
        } else {
          fetchErrorMessage = `Failed to fetch URL. Status: ${urlResponseCode}`;
          Logger.log(`${fetchErrorMessage} for ${currentUrl}`);
        }
      } catch (fetchError) {
        fetchErrorMessage = `Error fetching URL: ${fetchError.toString().substring(0,200)}`;
        Logger.log(`${fetchErrorMessage} for ${currentUrl}`);
      }

      if (fetchErrorMessage) {
         sheet.getRange(currentRowInSheet, eventsColIdx + 1).setValue(fetchErrorMessage);
         Utilities.sleep(1000);
         continue;
      }

      if (!pageContent) {
        sheet.getRange(currentRowInSheet, eventsColIdx + 1).setValue('Fetched content was empty or could not be processed.');
        Utilities.sleep(1000);
        continue;
      }
      
      const prompt = getPrompt(currentUrl, pageContent, currentDateString, name, notes);
      const geminiResponse = UrlFetchApp.fetch(GEMINI_API_ENDPOINT, getGeminiOptions(prompt));
      const geminiResponseCode = geminiResponse.getResponseCode();
      const geminiResponseBody = geminiResponse.getContentText();

      if (geminiResponseCode === 200) {
        const geminiOutput = getGeminiOutput(geminiResponseBody);
        // On success, update the output cell and the date cell
        const currentDate = new Date();
        const formattedDate = Utilities.formatDate(currentDate, timeZone, DATE_FORMAT);
        sheet.getRange(currentRowInSheet, eventsColIdx + 1).setValue(geminiOutput.trim());
        sheet.getRange(currentRowInSheet, readDateColIdx + 1).setValue(formattedDate);
        processedCount++;
      } else {
        Logger.log(`Gemini API Error for URL ${currentUrl}: ${geminiResponseCode} - ${geminiResponseBody}`);
        sheet.getRange(currentRowInSheet, eventsColIdx + 1).setValue(`Gemini API Error: ${geminiResponseCode} - ${geminiResponseBody.substring(0, 500)}`);
        processedCount++;
      }

    } catch (e) {
      Logger.log(`Script Error for URL ${currentUrl}: ${e.toString()}`);
      sheet.getRange(currentRowInSheet, eventsColIdx + 1).setValue(`Script Error: ${e.toString().substring(0,500)}`);
      processedCount++;
    }

    Utilities.sleep(1000);
  }
  let completionMessage = `Finished processing. ${processedCount} URLs processed, ${skippedCount} rows skipped (URL was empty or output already existed).`;
  if (limitReached) {
    completionMessage += `\n\nProcessing limit of ${MAX_ROWS_TO_PROCESS} rows was reached. Run the script again to process more.`;
  }
  sheet.getRange('A1').setValue(completionMessage);
}

/**
 * The main function to convert the active sheet's data to a JSON string.
 * The result is saved as a new file in your Google Drive.
 */
function convertSheetToJson() {
  const ui = SpreadsheetApp.getUi();
  
  // Get the currently active sheet in the spreadsheet
  const sheet = SpreadsheetApp.getActiveSheet();
  if (!sheet) {
    ui.alert('No active sheet found.');
    return;
  }

  // Get the entire range of data in the sheet
  const dataRange = sheet.getDataRange();
  
  // Get all the values from the data range as a 2D array
  const data = dataRange.getValues();

  // If there's no data or only a header row, exit.
  if (data.length < 2) {
    ui.alert('No data found to convert.');
    return;
  }

  // The first row of the data is assumed to be the headers.
  // We remove it from the main data array and store it separately.
  const headers = data.shift();

  // This array will hold all our converted row objects
  const jsonArray = [];

  // Loop through each row of the data
  data.forEach(row => {
    // Create an object to represent the current row
    const rowObject = {};

    // Loop through each cell in the current row
    row.forEach((cellValue, index) => {
      // Get the corresponding header for the current cell.
      // If a header doesn't exist for a column, use a placeholder.
      const header = headers[index] || `column_${index + 1}`;
      
      // Assign the cell value to a property on the object, using the header as the key
      if (index>0) { rowObject[header] = cellValue; }
    });

    // Add the newly created object to our main array
    jsonArray.push(rowObject);
  });

  // Convert the array of objects into a pretty-printed JSON string
  const jsonString = JSON.stringify(jsonArray, null, 2);

  try {
    // Create a new JSON file in the root of the user's Google Drive.
    // The file will be named after the active sheet.
    const fileName = `${sheet.getName()}_export.json`;
    // FIX: Replaced MimeType.JSON with the string 'application/json' for better reliability.
    const file = DriveApp.createFile(fileName, jsonString, 'application/json');
    
    // Create an HTML output for the dialog with a clickable link.
    const htmlOutput = HtmlService.createHtmlOutput(
        `<div>Conversion successful!</div><br/>` +
        `<div>JSON file created: <a href="${file.getUrl()}" target="_blank" rel="noopener noreferrer">${file.getName()}</a></div><br/>` +
        `<div>The file has been saved to the root folder of your Google Drive.</div>`
      )
      .setWidth(400)
      .setHeight(120);
      
    // Display a modeless dialog to the user showing the result.
    ui.showModalDialog(htmlOutput, 'Conversion Complete');

  } catch (e) {
    // If something goes wrong during file creation, show an error message.
    const errorMessage = `Error creating file in Google Drive: ${e.toString()}`;
    Logger.log(errorMessage);
    ui.alert(errorMessage);
  }
}


const CONFIG = {
  DESTINATION_SHEET_NAME: 'Events'  // 'Parsed Events (autogenerated)'
};

/**
 * Automatically detects settings, takes data from a single cell, splits it,
 * and appends the result to the destination sheet defined in CONFIG.
 */
function autoSplitAndAppendData() {
  let sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  const lastRow = sheet.getLastRow();
  if (lastRow < START_ROW) {
    SpreadsheetApp.getUi().alert('Info', 'No data to process in the specified range.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }

  const numRowsToProcess = lastRow - START_ROW + 1;
  const dataRange = sheet.getRange(START_ROW, 1, numRowsToProcess, 6); // Get range covering all needed columns
  const data = dataRange.getValues(); // Get all data at once for efficiency

  const ui = SpreadsheetApp.getUi();
  let processedCount = 0;
  let skippedCount = 0;
  let limitReached = false; // To track if we hit the processing limit
  const timeZone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();

  const destSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.DESTINATION_SHEET_NAME);
  for (let i = 0; i < data.length; i++) {
    // Stop if we have processed the maximum number of rows for this run
    if (processedCount >= MAX_ROWS_TO_PROCESS) {
      Logger.log(`Reached processing limit of ${MAX_ROWS_TO_PROCESS}. Stopping.`);
      limitReached = true;
      break;
    }

    const currentRowInSheet = START_ROW + i;
    let currentUrl = data[i][3];

    // Skip if URL is empty
    if (!currentUrl || currentUrl.toString().trim() === '') {
      Logger.log(`Skipping row ${currentRowInSheet} because URL is empty.`);
      skippedCount++;
      continue;
    }

    // Skip if output cell is already filled
    const outputCellContent = data[i][5]; // Adjust index for 0-based array
 
    if (outputCellContent && outputCellContent.toString().trim() !== '') {
      Logger.log(`Skipping ${data[i][0]} as output cell already has content: ${outputCellContent}`);
      skippedCount++;
      continue;
    }

    sheet.getRange('A1').setValue(`Processing: ${data[i][0]}`); // Status update cell
    SpreadsheetApp.flush(); // Force UI update

    try {
      let lastRow = destSheet.getLastRow();
      rows = splitTsv("D" + currentRowInSheet, data[i][0], lastRow);
      lastRow += rows;

      // On success, update the output cell and the date cell
      const currentDate = new Date();
      const formattedDate = Utilities.formatDate(currentDate, timeZone, DATE_FORMAT);
      sheet.getRange(currentRowInSheet, 6, 1, 2).setValues([[rows ? rows : -1, formattedDate]]);
      processedCount++;

    } catch (e) {
      Logger.log(`Script Error for URL ${currentUrl}: ${e.toString()}`);
      sheet.getRange(currentRowInSheet, 6).setValue(`Script Error: ${e.toString().substring(0,500)}`);
      processedCount++;
    }

  }
  let completionMessage = `Finished processing. ${processedCount} URLs processed, ${skippedCount} rows skipped (URL was empty or output already existed).`;
  if (limitReached) {
    completionMessage += `\n\nProcessing limit of ${MAX_ROWS_TO_PROCESS} rows was reached. Run the script again to process more.`;
  }
  sheet.getRange('A1').setValue(completionMessage);

}

function splitTsv(cellReference, siteName, lastRow) {
  const ui = SpreadsheetApp.getUi();
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const sourceCell = sheet.getRange(cellReference);
    if (sourceCell.getNumRows() !== 1 || sourceCell.getNumColumns() !== 1) {
        throw new Error(`Source range "${cellReference}" must be a single cell.`);
    }
    const rawData = sourceCell.getValue();
    if (typeof rawData !== 'string' || rawData.trim() === '') {
        ui.alert('No data found in the specified cell.');
        return;
    }

    // Get destination sheet from CONFIG
    let destSheet = spreadsheet.getSheetByName(CONFIG.DESTINATION_SHEET_NAME);

    // --- DATA PARSING ---
    const outputData = parseData(rawData, siteName);

    if (!outputData || outputData.length === 0) {
        //ui.alert('No data was processed after attempting to parse.');
        return 0;
    }

    // Delete old data with the same cell reference
    //deleteRowsByFirstCellContent(destSheet, siteName)

    // Append data to the destination sheet
    destSheet.getRange(lastRow + 1, 1, outputData.length, outputData[0].length)
             .setValues(outputData);

    //ui.alert('Success!', `${outputData.length} rows have been successfully appended to the "${CONFIG.DESTINATION_SHEET_NAME}" sheet.`, ui.ButtonSet.OK);
    return outputData.length;

  } catch (e) {
    ui.alert('An error occurred', e.message, ui.ButtonSet.OK);
    return -1;
  }
}

function deleteRowsByFirstCellContent(sheet, cellReference) {
  var dataRange = sheet.getDataRange();
  var values = dataRange.getValues();
  var rowsToDelete = [];

  for (var i = 0; i < values.length; i++) {
    // Check if the first cell (index 0) of the current row matches the specific content
    if (values[i][0] == cellReference) {
      rowsToDelete.push(i + 1); // Store the row number (1-indexed)
    }
  }

  // Delete rows from bottom up to avoid issues with shifting row numbers
  for (var i = rowsToDelete.length - 1; i >= 0; i--) {
    sheet.deleteRow(rowsToDelete[i]);
  }
}

/**
 * Parses the raw string data, detecting the format and returning a 2D array.
 * @param {string} rawData The raw string from the source cell.
 * @returns {string[][]} A 2D array of the parsed data.
 */
function parseData(rawData, siteName) {
    const lines = rawData.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 1) return [];
//    if (lines[0].startsWith("##")) { lines.shift(); }
//    if (lines[0].trim()='') { lines.shift(); }
    if (lines[0].startsWith("| name") || lines[0].startsWith("|name")) { lines.shift(); lines.shift(); }
    if (lines.length < 1) return [];

    const delimiterRegex = detectDelimiter(lines);
    
    parsedData = lines.map(line => {
      let l = siteName + " | " + line;
      let output = l.split(delimiterRegex).map(cell => cell.trim()); //.filter(lin => lin.trim() !== '');
      if (output.length>2)  {output.splice(1,1);}
      return output;
    });

//    SpreadsheetApp.getUi().alert(parsedData.map(line => line.length));
  //  SpreadsheetApp.getUi().alert(parsedData[parsedData.length-1]);
    //SpreadsheetApp.getUi().alert(parsedData[0]);
    return parsedData.filter(row => row.length == 13);
}


/**
 * Detects the most likely delimiter by checking for consistency.
 * @param {string[]} lines - An array of data lines (headers excluded).
 * @returns {RegExp} The regular expression for the detected delimiter.
 */
function detectDelimiter(lines) {
    const potentialDelimiters = [
        { name: '|', regex: /\|/ },
        { name: 'spaces', regex: /\s{2,}/ }
    ];
    const sample = lines.slice(0, 5); // Use a sample of up to 5 lines
    if (sample.length === 0) return /\s{2,}/; // Default to spaces if no data

    for (const delim of potentialDelimiters) {
        const firstLineCols = sample[0].split(delim.regex).length;
        if (firstLineCols > 1) {
            // Check if other lines have a similar number of columns
            const isConsistent = sample.every(line => {
                // Allow for a small variance in columns, e.g., for empty trailing cells
                return Math.abs(line.split(delim.regex).length - firstLineCols) <= 1;
            });
            if (isConsistent) {
                return delim.regex; // This is a likely delimiter
            }
        }
    }
    
    return /\s{2,}/; // Default to spaces if no consistent delimiter is found
}

/**
 * The main function to process event data. It reads data from the "Events" sheet,
 * filters out irrelevant or malformed rows, consolidates recurring events,
 * and writes the cleaned data to a new "Consolidated Events" sheet.
 */
function filterAndGroupEvents() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getSheetByName("Events");
  const destinationSheetName = "Consolidated Events";

  if (!sourceSheet) {
    SpreadsheetApp.getUi().alert('Sheet "Events" not found!');
    return;
  }

  // Read all data from the source sheet
  const data = sourceSheet.getDataRange().getValues();
  const headers = data.shift(); // Remove headers from data and store them

  // --- 1. Filter Data ---
  const filteredData = filterEventData(data, headers);

  // --- 2. Consolidate Data ---
  const { consolidatedHeaders, consolidatedRows } = consolidateEventData(filteredData, headers);

  // --- 3. Enrich Data with Location Info ---
  const { finalHeaders, finalRows } = enrichWithLocationData(ss, consolidatedHeaders, consolidatedRows);

  // --- 4. Write to Sheet ---
  updateSheetData(ss, destinationSheetName, finalHeaders, finalRows);
  
  SpreadsheetApp.getUi().alert('Event processing complete! The "Consolidated Events" sheet has been updated.');
}

/**
 * Builds a lookup map from the "Locations" sheet.
 * It handles cases where multiple rows share the same lat/lng by grouping them,
 * using the details from the first row encountered and aggregating all unique names.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss The active spreadsheet.
 * @returns {Object} A map where keys are location names (primary and alternate) and values are location details.
 */
function buildLocationMap(ss) {
  const locationsSheet = ss.getSheetByName("Locations");
  if (!locationsSheet) {
    SpreadsheetApp.getUi().alert('Sheet "Locations" not found!');
    return {};
  }
  const locationData = locationsSheet.getDataRange().getValues();
  locationData.shift(); // Remove header row

  const locationsByLatLng = {}; // Intermediate map, keyed by "lat,lng"
  locationData.forEach(row => {
    const [alternateNames, location, address, lat, lng, emoji] = row;
    const details = { emoji, lat, lng };

    // Skip rows without lat/lng
    if (lat == null || lng == null || lat === '' || lng === '') {
        return;
    }

    const latLngKey = `${lat},${lng}`;

    if (!locationsByLatLng[latLngKey]) {
      // First time seeing this lat/lng, create a new entry.
      // Store details from the first row encountered for this lat/lng.
      locationsByLatLng[latLngKey] = {
        details: { emoji, lat, lng, address },
        names: new Set() // Use a Set to avoid duplicate names
      };
    }

    // Add the primary location name to the set for this lat/lng
    if (location) {
      locationMap[String(location).toLowerCase().trim()] = details;
    }

    // Add any alternate names to the set
    if (alternateNames) {
      const regex = /"([^"]*)"/g;
      const matches = [...String(alternateNames).matchAll(regex)];

      matches.forEach(match => {
        const name = match[1].trim();
        if (name) {
            locationsByLatLng[latLngKey].names.add(name);
        }
      });
    }
  });

  // Now, build the final locationMap keyed by name
  const locationMap = {};
  for (const latLngKey in locationsByLatLng) {
    const group = locationsByLatLng[latLngKey];
    const details = group.details;
    group.names.forEach(name => {
      locationMap[name.toLowerCase().trim()] = details;
    });
  }

  return locationMap;
}

/**
 * Checks if a string contains letters or numbers, suggesting it is text and not an emoji.
 * @param {string} str The string to check.
 * @returns {boolean} True if the string contains letters or numbers.
 */
function isTextBased(str) {
  if (typeof str !== 'string' || str.length === 0) {
    return false;
  }
  // This regex checks for the presence of any alphanumeric characters.
  const textRegex = /[a-zA-Z0-9]/;
  return textRegex.test(str);
}

/**
 * Enriches consolidated event data with lat, lng, and corrected emoji
 * by looking up locations in the "Locations" sheet.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss The active spreadsheet.
 * @param {Array<String>} headers The consolidated header row.
 * @param {Array<Array<String>>} rows The consolidated data rows.
 * @returns {{finalHeaders: Array<String>, finalRows: Array<Array<String>>}} The enriched headers and rows.
 */
function enrichWithLocationData(ss, headers, rows) {
  const locationMap = buildLocationMap(ss);

  const locationIndex = headers.indexOf('location');
  const sublocationIndex = headers.indexOf('sublocation');
  const siteIndex = headers.indexOf('website');
  const emojiIndex = headers.indexOf('emoji');

  const finalHeaders = [...headers, 'lat', 'lng'];

  const finalRows = rows.map(row => {
    const locationName = row[locationIndex] ? String(row[locationIndex]).toLowerCase().trim() : '';
    const sublocationName = row[locationIndex] ? String(row[sublocationIndex]).toLowerCase().trim() : '';
    const siteName = row[siteIndex] ? String(row[siteIndex]).toLowerCase().trim() : '';

    // Look up by location name first, then by site name, then by "site|location" as a fallback.
    const locationDetails = locationMap[locationName] || locationMap[sublocationName] || (locationMap[sublocationName] + "|" + locationMap[sublocationName]) || locationMap[siteName] || (locationMap[siteName + "|" + locationName])

    let lat = '', lng = '';
    if (locationDetails) {
      lat = locationDetails.lat;
      lng = locationDetails.lng;

      // Update emoji if it's missing or doesn't start with an emoji character.
      const currentEmoji = row[emojiIndex];
      if (!currentEmoji || isTextBased(String(currentEmoji))) {
        row[emojiIndex] = locationDetails.emoji;
      }
    }
    return [...row, lat, lng];
  });

  return { finalHeaders, finalRows };
}

/**
 * Filters rows based on date criteria.
 * A row is removed if:
 * - It is missing a start_date.
 * - The end_date is not empty and is before 2025-08-01.
 * - The start_date is after 2025-12-01.
 * @param {Array<Array<String>>} data The event data rows.
 * @param {Array<String>} headers The header row.
 * @returns {Array<Array<String>>} The filtered data.
 */
function filterEventData(data, headers) {
  const startDateIndex = headers.indexOf('start_date');
  const endDateIndex = headers.indexOf('end_date');

  if (startDateIndex === -1 || endDateIndex === -1) {
    throw new Error("Could not find 'start_date' or 'end_date' columns.");
  }

  const minEndDate = new Date('2025-08-01');
  const maxStartDate = new Date('2025-12-01');

  return data.filter(row => {
    const startDateStr = row[startDateIndex];
    if (!startDateStr) { return false; }
    const endDateStr = row[endDateIndex] ? row[endDateIndex] : startDateStr;

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    return !((startDate > maxStartDate) || (endDate < minEndDate));
  });
}

/**
 * Groups events by name and location, consolidating their dates and times.
 * @param {Array<Array<String>>} filteredData The data after filtering.
 * @param {Array<String>} originalHeaders The original header row.
 * @returns {{consolidatedHeaders: Array<String>, consolidatedRows: Array<Array<String>>}} An object containing the new headers and consolidated rows.
 */
function consolidateEventData(filteredData, originalHeaders) {
  const nameIndex = originalHeaders.indexOf('name');
  const locationIndex = originalHeaders.indexOf('location');
  const startDateIndex = originalHeaders.indexOf('start_date');
  const startTimeIndex = originalHeaders.indexOf('start_time');
  const endDateIndex = originalHeaders.indexOf('end_date');
  const endTimeIndex = originalHeaders.indexOf('end_time');

  const eventGroups = {};

  // Group events by a composite key of name and location
  filteredData.forEach(row => {
    const name = row[nameIndex];
    const location = row[locationIndex];
    const key = `${name}|${location}`;

    if (!eventGroups[key]) {
      // This is the first time we see this event group.
      // Store the row data, excluding the date/time fields.
      const baseData = row.filter((_, index) => 
        ![startDateIndex, startTimeIndex, endDateIndex, endTimeIndex].includes(index)
      );
      eventGroups[key] = {
        baseData: baseData,
        datesAndTimes: []
      };
    }
    
    // Add the date and time details to the group
    const dateTimeInfo = [
      row[startDateIndex],
      row[startTimeIndex],
      row[endDateIndex],
      row[endTimeIndex]
    ];
    eventGroups[key].datesAndTimes.push(dateTimeInfo);
  });

  // Prepare the new headers, removing old date/time fields and adding the new one.
  const consolidatedHeaders = originalHeaders.filter((_, index) => 
    ![startDateIndex, startTimeIndex, endDateIndex, endTimeIndex].includes(index)
  );
  consolidatedHeaders.push('occurrences');
  
  // Prepare the final rows for the new sheet
  const consolidatedRows = Object.values(eventGroups).map(group => {
    // Manually construct the string to resemble a 2D array literal,
    // preserving the original formatting of dates and times.
    const datesAndTimesString = '[' + group.datesAndTimes.map(dateTimeInfo => {
      const quotedItems = dateTimeInfo.map(item => `"${String(item).replace(/"/g, '\\"')}"`);
      return `[${quotedItems.join(',')}]`;
    }).join(',') + ']';
    
    return [...group.baseData, datesAndTimesString];
  });

  return { consolidatedHeaders, consolidatedRows };
}

/**
 * Updates the destination sheet with new data. If the sheet doesn't exist, it's created.
 * If it does exist, old data is cleared (headers are preserved) before writing new data.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss The active spreadsheet.
 * @param {String} sheetName The name of the sheet to update.
 * @param {Array<String>} headers The header row for the sheet.
 * @param {Array<Array<String>>} rows The data rows to write.
 */
function updateSheetData(ss, sheetName, headers, rows) {
  let destSheet = ss.getSheetByName(sheetName);

  // If the sheet doesn't exist, create it and write the headers.
  if (!destSheet) {
    destSheet = ss.insertSheet(sheetName);
    destSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  // Clear only the data, leaving the header row (row 1) intact.
  // This check prevents an error if the sheet has only a header row.
  if (destSheet.getLastRow() > 1) {
    const rangeToClear = destSheet.getRange(2, 1, destSheet.getLastRow() - 1, destSheet.getLastColumn());
    rangeToClear.clearContent();
  }

  // Write the new data starting from the second row.
  if (rows.length > 0) {
    destSheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
}

/**
 * Geocodes addresses in the "Locations" sheet that are missing latitude and longitude.
 */
function geocodeAddresses() {
  const ui = SpreadsheetApp.getUi();
  const sheetName = "Locations"; // Assuming the sheet is named "Locations"
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    ui.alert(`Sheet "${sheetName}" not found.`);
    return;
  }

  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  values.shift();
  const headers = values.shift(); // Get and remove header row

  const addressCol = headers.indexOf('address');
  const latCol = headers.indexOf('lat');
  const lngCol = headers.indexOf('lng');
  const geocodedAddressCol = headers.indexOf('geocoded_address');

  if (addressCol === -1 || latCol === -1 || lngCol === -1 || geocodedAddressCol === -1) {
    ui.alert('Could not find required columns: "address", "lat", "lng", "geocoded_address". Please check your sheet headers.');
    return;
  }

  let geocodedCount = 0;
  const startRow = 3; // Data starts from row 2 (after header)

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const address = row[addressCol];
    const lat = row[latCol];
    const lng = row[lngCol];
    sheet.getRange('A1').setValue(`Processing "${address}".`);
    SpreadsheetApp.flush();

    // Check if address exists but lat/lng are missing
    if (address && (!lat || !lng)) {
      try {
        // Use Google's built-in geocoder and set bounds for NYC to bias results
        const geocoder = Maps.newGeocoder()
          .setBounds(40.477399, -74.25909, 40.917577, -73.700272);
        const response = geocoder.geocode(address);

        if (response.status === 'OK' && response.results.length > 0) {
          const result = response.results[0];
          const location = result.geometry.location;
          const formattedAddress = result.formatted_address;

          sheet.getRange(startRow + i, latCol + 1).setValue(location.lat);
          sheet.getRange(startRow + i, lngCol + 1).setValue(location.lng);
          sheet.getRange(startRow + i, geocodedAddressCol + 1).setValue(formattedAddress);
          sheet.getRange('A1').setValue(`Geocoded "${address}": ${location.lat}, ${location.lng}`);
          SpreadsheetApp.flush();
          geocodedCount++;
          
          Utilities.sleep(500); // Delay to respect geocoding quotas
        } else {
          sheet.getRange('A1').setValue(`Geocoding failed for address "${address}": ${response.status}`);
          SpreadsheetApp.flush();
          sheet.getRange(startRow + i, latCol + 1).setValue(`Error: ${response.status}`);
        }
      } catch (e) {
        sheet.getRange('A1').setValue(`Error geocoding address "${address}": ${e.toString()}`);
        SpreadsheetApp.flush();
        sheet.getRange(startRow + i, latCol + 1).setValue(`Error: ${e.message}`);
      }
    }
  }

  sheet.getRange('A1').setValue(`Geocoding Complete. Successfully geocoded ${geocodedCount} addresses.`);
}


/**
 * Adds a custom menu to the Google Sheet UI to run the script.
 */
function onOpen() {
  SpreadsheetApp.getUi()
      .createMenu('Gemini Tools')
      .addItem('1. Process URLs for Events', 'processURLs')
      .addItem('2. Split and append', 'autoSplitAndAppendData')
      .addItem('3. Consolidate Events', 'filterAndGroupEvents')
      .addItem('4. Geocode Missing Locations', 'geocodeAddresses')
      .addItem('5. Convert Active Sheet to JSON', 'convertSheetToJson')
      .addToUi();
}
