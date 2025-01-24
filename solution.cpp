#include <iostream>
#include <string>
using namespace std;

bool checkValidString(string s) {
    int low = 0, high = 0; // Range of unmatched left parentheses

    for (char ch : s) {
        if (ch == '(') {
            low++;
            high++;
        } else if (ch == ')') {
            low = max(low - 1, 0); // Ensure low doesn't go below 0
            high--;
        } else if (ch == '*') {
            low = max(low - 1, 0); // Treat '*' as ')'
            high++; // Treat '*' as '('
        }

        // If high becomes negative, there are too many ')'
        if (high < 0) {
            return false;
        }
    }

    // After processing, low must be 0 for the string to be valid
    return low == 0;
}

int main() {
    // Test cases
    string s;
    cin >> s;
    cout << (checkValidString(s) ? "true" : "false") << endl;       // true
    return 0;
}
