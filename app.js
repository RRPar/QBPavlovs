const categories = {
    "Literature": {
        subcategories: [
            "American Literature",
            "British Literature",
            "Classical Literature",
            "European Literature",
            "World Literature",
            "Other Literature"
        ],
        altcategories: [
            "Drama",
            "Long Fiction",
            "Poetry",
            "Short Fiction",
            "Misc Literature"
        ]
    },
    "History": {
        subcategories: [
            "American History",
            "Ancient History",
            "European History",
            "World History",
            "Other History"
        ]
    },
    "Science": {
        subcategories: [
            "Biology",
            "Chemistry",
            "Physics",
            "Other Science"
        ],
        altcategories: [
            "Math",
            "Astronomy",
            "Computer Science",
            "Earth Science",
            "Engineering",
            "Misc Science"
        ]
    },
    "Fine Arts": {
        subcategories: [
            "Visual Fine Arts",
            "Auditory Fine Arts",
            "Other Fine Arts"
        ],
        altcategories: [
            "Architecture",
            "Dance",
            "Film",
            "Jazz",
            "Musicals",
            "Opera",
            "Photography",
            "Misc Arts"
        ]
    },
    "Religion": {},
    "Mythology": {},
    "Philosophy": {},
    "Social Science": {
        altcategories: [
            "Anthropology",
            "Economics",
            "Linguistics",
            "Psychology",
            "Sociology",
            "Other Social Science"
        ]
    },
    "Current Events": {},
    "Geography": {},
    "Other Academic": {},
    "Pop Culture": {
        subcategories: [
            "Movies",
            "Music",
            "Sports",
            "Television",
            "Video Games",
            "Other Pop Culture"
        ]
    }
};

function updateFields(fieldType, fields) {
    for (let i = 0; i < 6; i++) {
        const fieldElement = document.getElementById(fieldType + "Value" + String(i + 1));
        fieldElement.style.visibility = "hidden";
    }

    for (let i = 0; i < fields.length; i++) {
        const fieldElement = document.getElementById(fieldType + "Value" + String(i + 1));
        fieldElement.textContent = fields[i];
        fieldElement.value = fields[i];
        fieldElement.style.visibility = "visible";
    }
}

function formatOutput(answer, grams) {
    return grams.map(entry => answer + ", " + entry[0]).join("\n");
}

function getSelectedText(selectElement, fallback) {
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    return selectedOption ? selectedOption.text : fallback;
}

function renderList(container, items, answer) {
    container.replaceChildren();

    if (items.length === 0) {
        const emptyState = document.createElement("p");
        emptyState.className = "result-empty";
        emptyState.textContent = "No matches met the current filters.";
        container.appendChild(emptyState);
        return;
    }

    const fragment = document.createDocumentFragment();
    const itemsPerColumn = 10;

    for (let i = 0; i < items.length; i += itemsPerColumn) {
        const column = document.createElement("div");
        column.className = "result-column";

        for (let j = i; j < Math.min(i + itemsPerColumn, items.length); j++) {
            const [gram] = items[j];
            const row = document.createElement("div");
            row.className = "result-row";
            row.textContent = answer + ", " + gram;
            column.appendChild(row);
        }

        fragment.appendChild(column);
    }

    container.appendChild(fragment);
}

async function main() {
    const findButton = document.getElementById("FindButton");
    const topicsField = document.getElementById("TopicsField");
    const subcategoryField = document.getElementById("SubcategoryField");
    const altcategoryField = document.getElementById("AltcategoryField");
    const answerElement = document.getElementById("AnswerField");
    const minimumElement = document.getElementById("MinimumField");
    const certaintyElement = document.getElementById("CertaintyField");
    const difficultiesElement = document.getElementById("DifficultiesField");
    const statusElement = document.getElementById("StatusMessage");
    const outputElement = document.getElementById("PavlovOutput");
    const copyButton = document.getElementById("CopyButton");

    const worker = new Worker("pavlovs-worker.js");

    let latestOutput = "";
    let workerReady = false;
    let searchInFlight = false;
    let workerLoading = true;

    function setStatus(message, tone = "info") {
        statusElement.textContent = message;
        statusElement.dataset.tone = tone;
    }

    function setSearchState(isBusy) {
        searchInFlight = isBusy;
        findButton.disabled = isBusy || workerLoading || !workerReady;
        findButton.textContent = isBusy ? "Working..." : "Find";
        copyButton.disabled = latestOutput.length === 0;
    }

    function categoryChanged() {
        const topic = topicsField.options[topicsField.selectedIndex].text;
        const reset = topic === "Category";

        topicsField.style.color = reset ? "rgb(165, 165, 165)" : "rgb(0,0,0)";
        subcategoryField.style.visibility = reset ? "hidden" : "visible";
        subcategoryField.value = "All";
        subcategoryField.style.color = "rgb(165, 165, 165)";
        altcategoryField.value = "All";
        altcategoryField.style.color = "rgb(165, 165, 165)";
        altcategoryField.style.visibility = "hidden";

        if (reset) {
            return;
        }

        const newFields = categories[topic];
        if ("subcategories" in newFields) {
            updateFields("Sub", newFields.subcategories);
            if ("altcategories" in newFields) {
                updateFields("Alt", newFields.altcategories);
            }
        } else if ("altcategories" in newFields) {
            updateFields("Alt", newFields.altcategories);
            subcategoryField.style.visibility = "hidden";
            altcategoryField.style.visibility = "visible";
        } else {
            subcategoryField.style.visibility = "hidden";
        }
    }

    function subcategoryChange() {
        const subcategory = subcategoryField.options[subcategoryField.selectedIndex].text;
        const reset = subcategory === "All";

        subcategoryField.style.color = reset ? "rgb(165, 165, 165)" : "rgb(0,0,0)";
        altcategoryField.style.visibility = reset ? "hidden" : "visible";
        altcategoryField.value = "All";
        altcategoryField.style.color = "rgb(165, 165, 165)";
    }

    function altcategoryChange() {
        const altcategory = altcategoryField.options[altcategoryField.selectedIndex].text;
        const reset = altcategory === "All";

        altcategoryField.style.color = reset ? "rgb(165, 165, 165)" : "rgb(0,0,0)";
    }

    function collectFilters() {
        return {
            topic: getSelectedText(topicsField, "Category"),
            subcategory: getSelectedText(subcategoryField, "All"),
            altcategory: getSelectedText(altcategoryField, "All"),
            answer: answerElement.value.trim().toLowerCase(),
            minimum: Number(minimumElement.value),
            certainty: Number(certaintyElement.value),
            difficulties: difficultiesElement.value
                .split(",")
                .map(value => value.trim())
                .filter(Boolean)
        };
    }

    function validateFilters(filters) {
        if (filters.topic === "Category") {
            return "Choose a category first.";
        }

        if (!filters.answer) {
            return "Enter an answer to search for.";
        }

        if (!filters.difficulties.length) {
            return "Enter at least one difficulty.";
        }

        if (Number.isNaN(filters.minimum) || filters.minimum < 1) {
            return "Minimum occurrences must be a number greater than 0.";
        }

        if (Number.isNaN(filters.certainty) || filters.certainty < 0 || filters.certainty > 1) {
            return "Minimum certainty must be a number between 0 and 1.";
        }

        return "";
    }

    function handleResults(payload) {
        const combinedResults = [
            ...payload.words,
            ...payload.bigrams,
            ...payload.trigrams
        ];

        latestOutput = [
            formatOutput(payload.answer, payload.words),
            formatOutput(payload.answer, payload.bigrams),
            formatOutput(payload.answer, payload.trigrams)
        ]
            .filter(Boolean)
            .join("\n");

        outputElement.textContent = latestOutput || "No pavlovs found for this search.";
        renderList(outputElement, combinedResults, payload.answer);

        setStatus("Pavlovs generated.", "success");
        setSearchState(false);
    }

    worker.addEventListener("message", event => {
        const { type, message, payload } = event.data;

        if (type === "status") {
            if (payload?.ready) {
                workerReady = true;
                workerLoading = false;
                setSearchState(false);
            }

            setStatus(message, payload?.tone || "info");
            return;
        }

        if (type === "results") {
            handleResults(payload);
            return;
        }

        if (type === "error") {
            setStatus(message, "error");
            setSearchState(false);
        }
    });

    function onClick() {
        const filters = collectFilters();
        const validationError = validateFilters(filters);

        if (validationError) {
            setStatus(validationError, "error");
            return;
        }

        setStatus("Searching tossups and building pavlovs...", "info");
        setSearchState(true);
        worker.postMessage({ type: "find", payload: filters });
    }

    async function copyResults() {
        if (!latestOutput) {
            return;
        }

        try {
            await navigator.clipboard.writeText(latestOutput);
            setStatus("Copied pavlovs to the clipboard.", "success");
        } catch (error) {
            setStatus("Clipboard copy failed in this browser context.", "error");
        }
    }

    findButton.addEventListener("click", onClick);
    topicsField.addEventListener("change", categoryChanged);
    subcategoryField.addEventListener("change", subcategoryChange);
    altcategoryField.addEventListener("change", altcategoryChange);
    copyButton.addEventListener("click", copyResults);

    setStatus("Loading tossups in the background...", "info");
    setSearchState(false);
    window.setTimeout(() => {
        worker.postMessage({ type: "init" });
    }, 0);
}

main();
