import argparse
import json
import re
from decimal import Decimal
from pathlib import Path


def parse_amount(value):
    """Convert a German currency string such as '-1.234,56 $' to a float."""
    cleaned = value.strip().replace("$", "").replace(" ", "")
    cleaned = cleaned.replace(".", "").replace(",", ".")
    return float(Decimal(cleaned))


def normalize_description(value):
    labels = {
        "LASTSCHRIFT": "Lastschrift",
        "ZAHLUNGSEINGANG": "Zahlungseingang",
    }
    match = re.match(r"^(LASTSCHRIFT|ZAHLUNGSEINGANG)(.*)$", value.strip())
    if match:
        return labels[match.group(1)] + match.group(2)
    return value.strip()


def convert_file(input_path, output_path):
    lines = [
        line.strip()
        for line in input_path.read_text(encoding="utf-8-sig").splitlines()
        if line.strip()
    ]

    if len(lines) % 4 != 0:
        raise ValueError(
            f"Erwartet vier nichtleere Zeilen pro Buchung, gefunden: {len(lines)}"
        )

    transactions = []
    for index in range(0, len(lines), 4):
        date, description, details, amount = lines[index:index + 4]
        amount_value = parse_amount(amount)
        details_without_quotes = details.replace('"', "")
        account_match = re.search(r"\(#(\d+)\)\s+-\s+Gehalt", details)

        transactions.append(
            {
                "date": date,
                "description": normalize_description(description),
                "details": details_without_quotes,
                "account_number": account_match.group(1) if account_match else None,
                "amount": amount,
                "amount_value": int(amount_value)
                if amount_value.is_integer()
                else amount_value,
            }
        )

    output_path.write_text(
        json.dumps(transactions, ensure_ascii=False, indent=4) + "\n",
        encoding="utf-8",
    )
    return len(transactions)


def main():
    parser = argparse.ArgumentParser(
        description="Konvertiert Plain-Text-Transaktionen in das Website-JSON-Format."
    )
    parser.add_argument("input", type=Path, help="Quelldatei mit vier Zeilen pro Buchung")
    parser.add_argument("output", type=Path, help="Zieldatei im JSON-Format")
    args = parser.parse_args()

    count = convert_file(args.input, args.output)
    print(f"{count} Transaktionen nach {args.output} konvertiert.")


if __name__ == "__main__":
    main()