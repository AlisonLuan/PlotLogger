import { parseTRC } from './parser-trc.js';
import { parseASC } from './parser-asc.js';
import { parseBLF } from './parser-blf.js';


export let log = null; // Global variable to store the log

export function resetLog() {
    log = [];
}

// Check if log is not loaded.
export function isLogLoaded() {
    if (!log) {
        return false;
    } else {
        return true;
    }
}

function selectFileLOG() {
    return new Promise((resolve, reject) => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.blf, .trc, .asc';

        // Wait a little before triggering the click
        setTimeout(() => {
            fileInput.addEventListener('change', function (event) {

                // Get the selected file
                const file = event.target.files[0];
                if (file) {
                    resolve(file); // Resolve with the selected file
                } else {
                    reject("No file selected.");
                }
            });
            fileInput.click();
        }, 5);
    });
}


export async function parseFileLOG(file) {
    try {
        const fileExtension = file.name.split('.').pop().toLowerCase();

        let parsedData;
        document.body.style.cursor = 'wait'; // Switch cursor to wait

        switch (fileExtension) {
            case 'blf':
                parsedData = await parseBLF(file); // Directly handle BLF files
                break;
            case 'trc':
                parsedData = await parseTRC(file); // Handle TRC files
                break;
            case 'asc':
                parsedData = await parseASC(file); // Handle ASC files
                break;
            default:
                alert('Unsupported file format!');
                return;
        }
        return parsedData;

    } catch (error) {
        console.error("Error processing the log file:", error);
    } finally {
        document.body.style.cursor = 'default'; // Revert cursor to default
    }
}

/**
 * Converts parsed CAN messages into the unified log format.
 * @param {Array} parsedMessages - Array of parsed CAN messages from parseBLF.
 */
export function buildUnifiedLog(parsedMessages) {

    resetLog();

    // Iterate over each parsed CAN message
    parsedMessages.forEach((msg) => {
        const date = new Date(msg.timestamp * 1000); // Convert timestamp to milliseconds
        const humanReadableTimestamp = date.toISOString(); // Convert to ISO string

        const unifiedMessage = {
            timestamp: humanReadableTimestamp, // Human-readable timestamp
            id: `0x${msg.arbitrationId.toString(16).toUpperCase()}`, // Hexadecimal ID
            data: Array.from(msg.data), // Convert Uint8Array to a standard array
            channel: msg.channel || null, // CAN channel (null if not provided)
            isExtendedId: msg.isExtendedId, // Extended ID flag
            isRemoteFrame: msg.isRemoteFrame, // Remote frame flag
            isRx: msg.isRx // Rx flag
        };

        // Add the unified message to the log
        log.push(unifiedMessage);
    });
}

/*
{
    "log": [
      {
        "timestamp": 123456789.123,  // Timestamp in seconds
        "id": "0x100",             // CAN message ID in hexadecimal
        "data": [255, 0, 34, 12],  // Raw CAN payload
        "channel": 1,              // CAN channel (if provided)
        "isExtendedId": false,     // Whether the ID is extended
        "isRemoteFrame": false,    // Whether it's a remote frame
        "isRx": true               // Whether it is a received message
      }
    ]
  }
*/
