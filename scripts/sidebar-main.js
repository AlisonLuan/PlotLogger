import databaseHandler from "./main-db-loader.js";

/**
* Helper function to populate a list of checkboxes.
* 
* @param {string[]} list - The list of items to populate as checkboxes.
* @param {HTMLElement} container - The container to populate.
* @param {string} emptyMessage - The message to display if the list is empty.
*/
function populateCheckboxList(list, container, emptyMessage) {
    if (list.length > 0) {
      // Sort the list alphabetically
      list.sort((a, b) => a.localeCompare(b));
      let html = "";
      list.forEach(item => {
        // Parse out the two parts (before and inside parentheses)
        let descriptionText = "";
        const match = item.match(/^(.*)\s*\((.*)\)$/);
        if (match) {
          const part1 = match[1].trim();
          const part2 = match[2].trim();
          let msgObj = findMessageInDatabaseById(part1);
          if (!msgObj) {
            msgObj = findMessageInDatabaseById(part2);
          }
          if (!msgObj) {
            msgObj = findMessageInDatabaseByName(part1) || findMessageInDatabaseByName(part2);
          }
          if (msgObj && msgObj.description && msgObj.description.trim() !== "") {
            descriptionText = msgObj.description;
          }
        }
        // Build the label with tooltip events only if a valid description exists.
        html += `
          <label
            ${descriptionText ? `onmousemove='showTooltip(event, ${JSON.stringify(descriptionText)})'` : ""}
            onmouseleave="hideTooltip()"
          >
            <input type="checkbox" value="${item}"> ${item}
          </label>`;
      });
      container.innerHTML = html;
    } else {
      container.innerHTML = `<p>${emptyMessage}</p>`;
    }
  }

/**
 * Populates the checkbox group based on the selected filter option.
 * 
 * @param {string} filter - The selected filter value from the dropdown.
 */
function populateCheckboxGroup(filter, dropdownContent) {
    // Get the checkbox group container
    const checkboxGroup = document.querySelector('#checkbox-sources .checkbox-group');

    // Clear existing content
    checkboxGroup.innerHTML = '';

    /*const database = databaseHandler.getDatabase();
    const dropdownContent = databaseHandler.getDropdownContent();
    
    // Handle case where the database is not loaded
    if (!database || !dropdownContent) {
        checkboxGroup.innerHTML = `<p>Please load a database to apply filters.</p>`;
        return;
    }*/

    // Populate checkboxes based on the selected filter
    if (filter === 'noFilter') {
        checkboxGroup.innerHTML = `<p>No filter applied.</p>`;
        // Do not populate sources, but call a function to handle signals if needed
        populateSignals();
    } else if (filter === 'filterById') {
        // Combine IDs and message names into "ID Name" format
        const idLabels = dropdownContent.ID.map((id, index) => `${id} (${dropdownContent.MsgName[index]})`);
        populateCheckboxList(idLabels, checkboxGroup, 'No IDs available.');
    } else if (filter === 'filterByName') {
        // Combine IDs and message names into "ID Name" format
        const NamedLabels = dropdownContent.MsgName.map((name, index) => `${name} (${dropdownContent.ID[index]})`);
        populateCheckboxList(NamedLabels, checkboxGroup, 'No Names available.');
    } else if (filter === 'filterBySender') {
        populateCheckboxList(dropdownContent.Sender, checkboxGroup, 'No senders available.');
    }
}

// Tracks all checked signals, e.g. "Speed (Engine)" 
const selectedSignals = new Set();

function handleSignalMouseMove(e) {
    const tooltip = document.getElementById('custom-tooltip');
    tooltip.style.display = 'block';
    tooltip.textContent = 'temperamental';
    tooltip.style.left = (e.pageX + 10) + 'px';
    tooltip.style.top = (e.pageY + 10) + 'px';
}

function handleSignalMouseLeave() {
    const tooltip = document.getElementById('custom-tooltip');
    tooltip.style.display = 'none';
}

/**
 * Populates the checkbox-signals container based on selected sources (or displays all signals if no source is selected).
 */
function populateSignals(database) {

    // If no database is provided, get it from the handler.
    if (!database) {
      database = databaseHandler.getDatabase();
      if (!database) {
        console.error("Database not loaded.");
        return;
      }
    }

    const checkboxGroup = document.querySelector('#checkbox-signals .checkbox-group');
    const selectedSources = Array.from(
      document.querySelectorAll('#checkbox-sources .checkbox-group input[type="checkbox"]:checked')
    ).map(checkbox => checkbox.value);
  
    // Clear existing content
    checkboxGroup.innerHTML = '';
    const allSignals = new Set();
  
    if (selectedSources.length === 0) {
      // If no sources are selected, display all signals from all messages
      database.messages.forEach(message => {
        message.signals.forEach(signal => {
          allSignals.add(`${signal.name} (${message.name})`);
        });
      });
    } else {
      // Filter signals based on the selected filter option
      const filterType = document.getElementById('filterOptions').value;
      selectedSources.forEach(source => {
        if (filterType === 'filterById') {
          const idOnly = source.split(' (')[0];
          const message = database.messages.find(msg => msg.id === idOnly);
          if (message) {
            message.signals.forEach(signal => {
              allSignals.add(`${signal.name} (${message.name})`);
            });
          }
        } else if (filterType === 'filterByName') {
          const nameOnly = source.split(' (')[0];
          const message = database.messages.find(msg => msg.name === nameOnly);
          if (message) {
            message.signals.forEach(signal => {
              allSignals.add(`${signal.name} (${message.name})`);
            });
          }
        } else if (filterType === 'filterBySender') {
          database.messages
            .filter(msg => msg.sender === source)
            .forEach(message => {
              message.signals.forEach(signal => {
                allSignals.add(`${signal.name} (${message.name})`);
              });
            });
        }
      });
    }
  
    // Convert the set to an array and sort it
    const sortedSignals = Array.from(allSignals).sort((a, b) => a.localeCompare(b));
  
    if (sortedSignals.length > 0) {
      let html = "";
      sortedSignals.forEach(signalString => {
        const isChecked = selectedSignals.has(signalString);
        const parts = signalString.split(" (");
        const sigName = parts[0];
        const msgName = parts[1] ? parts[1].replace(")", "") : "";
        // Get the description from the database.
        const signalObj = findSignalInDatabase(sigName, msgName);
        // Check if there's a valid description.
        const hasDescription = signalObj && signalObj.description && signalObj.description.trim() !== "";
        const description = hasDescription ? signalObj.description : "";
        
        html += `
            <label
              ${hasDescription ? `onmousemove='showTooltip(event, ${JSON.stringify(description)})'` : ""}
              onmouseleave="hideTooltip()"
            >
              <input type="checkbox" value="${signalString}" ${isChecked ? 'checked' : ''} />
              ${signalString}
            </label>`;
      });
      checkboxGroup.innerHTML = html;
  
      // Attach change listeners to the checkboxes
      const inputs = checkboxGroup.querySelectorAll('input[type="checkbox"]');
      inputs.forEach(input => {
        input.addEventListener('change', e => {
          if (e.target.checked) {
            selectedSignals.add(e.target.value);
          } else {
            selectedSignals.delete(e.target.value);
          }
        });
      });
    } else {
      checkboxGroup.innerHTML = `<p>No signals available for the selected sources.</p>`;
    }
  }
  
  

/******************** Resize Sources checkbox  ********************/
let isResizingSources = false;
const resizeHandleSources = document.getElementById('resizeHandleSources');
resizeHandleSources.addEventListener('mousedown', (e) => {
    isResizingSources = true;
    document.body.style.cursor = 'ns-resize'; // cursor style indicating a north-south resize
    document.body.style.userSelect = 'none'; // Prevent text selection during drag
    document.addEventListener('mousemove', resizeSources);
    document.addEventListener('mouseup', stopResizingSources);
});


function resizeSources(e) {
    if (!isResizingSources) return;
    const sourcesContainer = document.getElementById('checkbox-sources');
    const signalsContainer = document.getElementById('checkbox-signals');

    // Calculate the new height for checkbox-sources
    const containerRect = sourcesContainer.getBoundingClientRect();
    const newHeight = e.clientY - containerRect.top;

    const minHeight = 150; // Minimum height for sources
    const maxHeight = 1400; // Maximum height for sources

    if (newHeight >= minHeight && newHeight <= maxHeight) {
        sourcesContainer.style.height = `${newHeight}px`; // Resize sources container
        //signalsContainer.style.maxHeight = `calc(100vh - ${newHeight + 50}px)`; // Adjust signals container
        // Calculate and set the height for checkbox-signals to fill remaining space
        const remainingHeight = window.innerHeight - newHeight - resizeHandleSources.offsetHeight - 20; // Adjust for handle and margins
        signalsContainer.style.height = `${remainingHeight}px`; // Resize signals container
       
    }
}

function stopResizingSources() {
    isResizingSources = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = ''; // Re-enable text selection
    document.removeEventListener('mousemove', resizeSources);
    document.removeEventListener('mouseup', stopResizingSources);
}

/******************** Plot Button  ********************/

function updateButtonColor(buttonId, condition) {
    let button = document.getElementById(buttonId);

    if (button) {
        if (condition) {
            button.style.backgroundColor = "#9bf59ef3"; // Green (Hex)
            //button.style.color = "#FFFFFF"; // White text (Hex)
        } else {
            button.style.backgroundColor = "#fffffff3"; // white (Hex)
            //button.style.color = "#FFFFFF"; // White text (Hex)
        }
    } else {
        console.error(`Button with ID '${buttonId}' not found.`);
    }
}

// Encapsulated scroll handler for filter options
function handleFilterOptionsScroll(event) {
    event.preventDefault(); // Prevent the page from scrolling

    const filterOptions = document.getElementById("filterOptions");
    const currentIndex = filterOptions.selectedIndex;
    let newIndex = currentIndex;

    // Calculate new index based on scroll direction
    if (event.deltaY > 0) {
        newIndex = Math.min(currentIndex + 1, filterOptions.options.length - 1);
    } else {
        newIndex = Math.max(currentIndex - 1, 0);
    }

    // Only update if the index has changed
    if (newIndex !== currentIndex) {
        filterOptions.selectedIndex = newIndex;
        // Manually trigger the change event
        const changeEvent = new Event("change", { bubbles: true });
        filterOptions.dispatchEvent(changeEvent);
    }
}

export { populateSignals }; // Export if used in other modules
export { populateCheckboxGroup }; // Export if used in other modules
export { handleFilterOptionsScroll }; // Export if used in other modules
export { updateButtonColor }; // Export if used in other modules
export { handleSignalMouseMove }; // Export if used in other modules
export { handleSignalMouseLeave }; // Export if used in other modules