This web application generates dynamic graphs to visualize signals recorded over CAN communication within a network. The graph is produced using two key user-provided inputs:
— a database file, of formats .sym or .dbc, and
- a log file, of formats .asc, .trc. or .blf
Along with additional parameters entered through the user interface.

Core Functionality
	1.	Data Ingestion and Parsing
	•	The application accepts two files: a database and a log.
	•	It supports multiple file formats for both databases and logs by parsing and converting the data into a standardized dataset.
	•	The original files remain unmodified; only the derived dataset changes based on user input.
	2.	Graph Generation
	•	The parsed data and additional user inputs are combined to create a visual representation of the signal data.
	•	The graph dynamically reflects the selected signals from the database and the corresponding log data.

User Interface and Interaction
	•	Centralized UI Control:
The application’s user interactions are as follows:
	•	File Upload and Signal Selection:
	•	Users begin by uploading the database and log files.
	•	The interface is then populated with available signals, which users can filter and select using checkboxes.
	•	Graph Customization and Navigation:
	•	After generating the graph, users can further customize its appearance (e.g., changing line colors, adjusting axis scales, and reassigning axes) through a dedicated “brush” sidebar.
	•	The application also offers dynamic navigation options such as zooming and panning for detailed data exploration.

Future Scalability

The application is designed to grow and adapt with future enhancements, including:
	•	Additional File Formats:
Supporting a wider range of formats for both database and log files.
	•	Expanded Customization:
Introducing more graph customization options to meet diverse user requirements.
	•	Multi-Graph Support:
Allowing users to generate and view multiple graphs simultaneously, enabling split-screen functionality.


# logplotter
Visual representation for logged CAN bus communication


npm install --save-dev jest
npm install --save-dev @babel/preset-env @babel/preset-typescript babel-jest
npm install --save-dev jest-environment-jsdom

To install the dependencies, run on console:
npm install