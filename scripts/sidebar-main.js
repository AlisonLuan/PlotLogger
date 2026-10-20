import databaseHandler from "./main-db-loader.js";
import { isFrameInLog, isLogLoaded } from "./main-log-loader.js";

/**
* Helper function to populate a list of checkboxes.
* 
* @param {string[]} list - The list of items to populate as checkboxes.
* @param {HTMLElement} container - The container to populate.
* @param {string} emptyMessage - The message to display if the list is empty.
*/
function populateCheckboxList(list, container, emptyMessage) {
    if (list.length > 0) {
      container.replaceChildren();
      list.sort((a, b) => a.label.localeCompare(b.label));
      list.forEach(item => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = item.value;
        if (item.messageId !== undefined) checkbox.dataset.messageId = item.messageId;
        if (item.messageName !== undefined) checkbox.dataset.messageName = item.messageName;
        label.append(checkbox, document.createTextNode(` ${item.label}`));
        if (item.description) {
          label.addEventListener('mousemove', event => window.showTooltip(event, item.description));
          label.addEventListener('mouseleave', window.hideTooltip);
        }
        container.appendChild(label);
      });
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
        const messages = databaseHandler.getDatabase()?.messages || [];
        const idLabels = messages.map(message => {
          return { value: message.id, label: `${message.id} (${message.name})`, messageId: message.id, description: message.description };
        });
        populateCheckboxList(idLabels, checkboxGroup, 'No IDs available.');
    } else if (filter === 'filterByName') {
        const messages = databaseHandler.getDatabase()?.messages || [];
        const namedLabels = messages.map(message => {
          return { value: message.name, label: `${message.name} (${message.id})`, messageId: message.id, messageName: message.name, description: message.description };
        });
        populateCheckboxList(namedLabels, checkboxGroup, 'No Names available.');
    } else if (filter === 'filterBySender') {
        const senders = Array.from(new Set(dropdownContent.Sender));
        populateCheckboxList(senders.map(sender => ({ value: sender, label: sender })), checkboxGroup, 'No senders available.');
    }
}

// Tracks all checked signals, e.g. "Speed (Engine)" 
const selectedSignals = new Set();
const signalKey = (messageId, signalName) => JSON.stringify([messageId, signalName]);

function clearSelectedSignals() {
  selectedSignals.clear();
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
    ).map(checkbox => ({
      value: checkbox.value,
      messageId: checkbox.dataset.messageId,
      messageName: checkbox.dataset.messageName
    }));
  
    // Clear existing content
    checkboxGroup.innerHTML = '';
    const allSignals = new Map();
    const onlyAvailable = isAvailableOnlyEnabled();
    const addMessage = message => {
      if (onlyAvailable && !isFrameInLog(message.id, message.isExtendedId ?? false)) return;
      message.signals.forEach(signal => {
        allSignals.set(signalKey(message.id, signal.name), { signalName: signal.name, messageId: message.id, messageName: message.name, signal });
      });
    };
  
    if (selectedSources.length === 0) {
      // If no sources are selected, display all signals from all messages
      database.messages.forEach(addMessage);
    } else {
      // Filter signals based on the selected filter option
      const filterType = document.getElementById('filterOptions').value;
      if (filterType === 'filterById') {
        const ids = new Set(selectedSources.map(source => source.messageId));
        database.messages.forEach(message => { if (ids.has(message.id)) addMessage(message); });
      } else if (filterType === 'filterByName') {
        const keys = new Set(selectedSources.map(source => JSON.stringify([source.messageId, source.messageName])));
        database.messages.forEach(message => { if (keys.has(JSON.stringify([message.id, message.name]))) addMessage(message); });
      } else if (filterType === 'filterBySender') {
        const senders = new Set(selectedSources.map(source => source.value));
        database.messages.forEach(message => { if (senders.has(message.sender)) addMessage(message); });
      }
    }
  
    // Convert the set to an array and sort it
    const sortedSignals = Array.from(allSignals.values())
      .sort((a, b) => `${a.signalName} (${a.messageName})`.localeCompare(`${b.signalName} (${b.messageName})`));
  
    if (sortedSignals.length > 0) {
      const fragment = document.createDocumentFragment();
      sortedSignals.forEach(({ signalName, messageId, messageName, signal }) => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        const key = signalKey(messageId, signalName);
        checkbox.type = 'checkbox';
        checkbox.value = key;
        checkbox.dataset.signalName = signalName;
        checkbox.dataset.messageId = messageId;
        checkbox.checked = selectedSignals.has(key);
        label.append(checkbox, document.createTextNode(` ${signalName} (${messageName})`));
        if (signal?.description) {
          label.addEventListener('mousemove', event => window.showTooltip(event, signal.description));
          label.addEventListener('mouseleave', window.hideTooltip);
        }
        checkbox.addEventListener('change', event => {
          if (event.target.checked) selectedSignals.add(key);
          else selectedSignals.delete(key);
        });
        fragment.appendChild(label);
      });
      checkboxGroup.replaceChildren(fragment);
    } else {
      checkboxGroup.innerHTML = onlyAvailable
        ? `<p>No signals from the selected sources are present in the loaded trace.</p>`
        : `<p>No signals available for the selected sources.</p>`;
    }
  }

function isAvailableOnlyEnabled() {
  const checkbox = document.getElementById('availableSignalsOnly');
  return Boolean(checkbox && checkbox.checked && !checkbox.disabled && isLogLoaded());
}

/** Enables the "available signals only" checkbox only while a trace is loaded. */
function updateAvailableOnlyCheckbox() {
  const checkbox = document.getElementById('availableSignalsOnly');
  if (!checkbox) return;
  const loaded = isLogLoaded();
  checkbox.disabled = !loaded;
  const label = checkbox.closest('label');
  label?.classList.toggle('disabled', !loaded);
  if (label) label.title = loaded ? 'Hide signals whose frames are not in the loaded trace' : 'Requires a loaded trace';
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
export { updateAvailableOnlyCheckbox };
export { populateCheckboxGroup }; // Export if used in other modules
export { handleFilterOptionsScroll }; // Export if used in other modules
export { updateButtonColor }; // Export if used in other modules
export { clearSelectedSignals };