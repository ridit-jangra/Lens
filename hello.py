# hello.py
# A simple script that reads a text file, makes an HTTP request,
# and prints the result in a friendly way.

import json
import pathlib
import sys
from urllib.request import urlopen

def read_local_file(path: str) -> str:
    """Read the contents of a file and return it as a string."""
    file_path = pathlib.Path(path)
    if not file_path.is_file():
        raise FileNotFoundError(f"❌ File not found: {path}")
    return file_path.read_text(encoding="utf-8")

def fetch_json(url: str) -> dict:
    """Fetch JSON from a URL and decode it into a Python dict."""
    with urlopen(url) as response:
        if response.status != 200:
            raise RuntimeError(f"❌ HTTP {response.status} from {url}")
        data = response.read()
        return json.loads(data)

def main():
    # 1️⃣ Read a local file (optional – you can comment this out)
    try:
        local_content = read_local_file("example.txt")
        print("📄 Contents of example.txt:")
        print(local_content)
    except FileNotFoundError:
        print("⚠️ example.txt not found – skipping that step.")

    # 2️⃣ Fetch some JSON data from a public API
    url = "https://api.github.com/repos/python/cpython"
    print(f"\n🌐 Fetching data from {url} …")
    repo_info = fetch_json(url)

    # 3️⃣ Extract a couple of useful fields and display them
    name = repo_info.get("name")
    stars = repo_info.get("stargazers_count")
    description = repo_info.get("description")
    print("\n🔎 Repository info:")
    print(f"• Name: {name}")
    print(f"• Stars: {stars:,}")          # adds commas for readability
    print(f"• Description: {description}")

    return 0

if __name__ == "__main__":
    sys.exit(main())
