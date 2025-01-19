const vscode = require('vscode');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const GRAPHQL_ENDPOINT = "https://leetcode.com/graphql";

// Function to query LeetCode's API
async function queryLeetCodeAPI(query, variables) {
    try {
        const response = await axios.post(
            GRAPHQL_ENDPOINT,
            { query, variables },
            {
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
        return response.data;
    } catch (error) {
        vscode.window.showErrorMessage(`Error: ${error}`);
        return null;
    }
}

// Command to query a problem and show results
async function fetchProblemDetails() {
    const titleSlug = await vscode.window.showInputBox({
        prompt: 'Enter the problem slug (e.g., "two-sum")',
    });

    if (!titleSlug) {
        vscode.window.showErrorMessage("Problem slug is required!");
        return;
    }

    const query = `
        query getProblemDetails($titleSlug: String!) {
            question(titleSlug: $titleSlug) {
                title
                titleSlug
                content
                difficulty
                exampleTestcases
            }
        }
    `;

    const variables = { titleSlug };
    const data = await queryLeetCodeAPI(query, variables);

    if (!data || !data.data || !data.data.question) {
        vscode.window.showErrorMessage("Failed to fetch problem details. Please check the problem slug.");
        return;
    }

    const problem = data.data.question;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder found. Open a folder in VS Code before running this command.");
        return;
    }

    const testCasesDir = path.join(workspaceFolder, "testcases");
    if (!fs.existsSync(testCasesDir)) {
        fs.mkdirSync(testCasesDir);
    }

    // Save test cases in CPH-compatible format
    problem.exampleTestcases.forEach((testCase, index) => {
        const inputPath = path.join(testCasesDir, `input_${index + 1}.txt`);
        const outputPath = path.join(testCasesDir, `output_${index + 1}.txt`);
        fs.writeFileSync(inputPath, testCase.input);
        fs.writeFileSync(outputPath, testCase.output);
    });

    vscode.window.showInformationMessage(`Test cases saved in ${testCasesDir}`);


        // Open a webview to display the problem statement
    const panel = vscode.window.createWebviewPanel(
        "leetcodeHelper",
        `Problem: ${problem.title}`,
        vscode.ViewColumn.One,
        {
            enableScripts: true, // Allow JavaScript in the webview
        }
);

// Set the HTML content of the webview
panel.webview.html = getWebviewContent(problem);

function getWebviewContent(problem) {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${problem.title}</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    padding: 20px;
                }
                h1 {
                    color: #333;
                }
                .difficulty {
                    font-size: 1.2em;
                    color: ${problem.difficulty === "Easy" ? "green" : problem.difficulty === "Medium" ? "orange" : "red"};
                }
                pre {
                    padding: 10px;
                    border-radius: 5px;
                    overflow-x: auto;
                }
            </style>
        </head>
        <body>
            <h1>${problem.title}</h1>
            <p class="difficulty">Difficulty: ${problem.difficulty}</p>
            <h2>Problem Statement</h2>
            <div>${problem.content}</div>
            <h2>Example Testcases</h2>
            <pre>${problem.exampleTestcases}</pre>
        </body>
        </html>
    `;
}

const language = await vscode.window.showQuickPick(["C++", "Python", "JavaScript"], {
    placeHolder: "Select your preferred programming language",
});

if (!language) {
    vscode.window.showErrorMessage("You must select a programming language to proceed.");
    return;
}

// Define solution templates for different languages
const templates = {
    "C++": `
// Problem: ${problem.title}
// Difficulty: ${problem.difficulty}

#include <iostream>
using namespace std;

void solution() {
// Your code here
}

int main() {
solution();
return 0;
}
`,
    Python: `# Problem: ${problem.title}\n# Difficulty: ${problem.difficulty}\n\ndef solution():\n    # Your code here\n    pass\n\nif __name__ == "__main__":\n    solution()\n`,
    JavaScript: `
// Problem: ${problem.title}
// Difficulty: ${problem.difficulty}

function solution() {
// Your code here
}

solution();
`,
};

const solutionTemplate = templates[language];

// Create and open a new file with the selected language and template
const doc = await vscode.workspace.openTextDocument({
    content: solutionTemplate,
    language: language.toLowerCase(), // Convert language to lowercase for VS Code
});

vscode.window.showTextDocument(doc);
vscode.window.showInformationMessage(`${language} template loaded successfully.`);


}

async function runTestCases() {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
        vscode.window.showErrorMessage("No active editor. Please open a file with your solution.");
        return;
    }

    const userCode = editor.document.getText();

    // Check workspace folder
    if (!vscode.workspace.workspaceFolders) {
        vscode.window.showErrorMessage("No workspace folder is open. Please open a workspace with testcases.json.");
        return;
    }

    const testCasesPath = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, "testcases.json");

    if (!fs.existsSync(testCasesPath)) {
        vscode.window.showErrorMessage(`Test cases file not found at ${testCasesPath}.`);
        return;
    }

    // Parse test cases
    let testCases;
    try {
        testCases = JSON.parse(fs.readFileSync(testCasesPath, "utf-8"));
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to parse testcases.json: ${error.message}`);
        return;
    }

    if (!Array.isArray(testCases) || !testCases.every(tc => "input" in tc && "output" in tc)) {
        vscode.window.showErrorMessage("Invalid test cases format. Each test case should have 'input' and 'output' properties.");
        return;
    }

    // Execute user code
    const results = [];
    for (const testCase of testCases) {
        try {
            const result = eval(`
                (function() {
                    ${userCode}
                    return solution(${JSON.stringify(testCase.input)});
                })()
            `);
            results.push({ input: testCase.input, expected: testCase.output, actual: result });
        } catch (error) {
            results.push({ input: testCase.input, error: error.message });
        }
    }

    // Display results
    const outputChannel = vscode.window.createOutputChannel("LeetCode Test Results");
    outputChannel.show();
    results.forEach((res, index) => {
        outputChannel.appendLine(`Test Case ${index + 1}:`);
        if (res.error) {
            outputChannel.appendLine(`   ❌ Error: ${res.error}`);
        } else if (res.actual === res.expected) {
            outputChannel.appendLine(`   ✅ Passed`);
        } else {
            outputChannel.appendLine(`   ❌ Failed`);
            outputChannel.appendLine(`      Input: ${JSON.stringify(res.input)}`);
            outputChannel.appendLine(`      Expected: ${res.expected}`);
            outputChannel.appendLine(`      Actual: ${res.actual}`);
        }
    });
}





function activate(context) {
	
    let disposable = vscode.commands.registerCommand('leetcode.queryProblem', fetchProblemDetails);
    context.subscriptions.push(disposable);

    let runTestCasesCmd = vscode.commands.registerCommand("leetcode.runTestCases", runTestCases);
context.subscriptions.push(runTestCasesCmd);

}

function deactivate() {}


module.exports = {
	activate,
	deactivate
}
