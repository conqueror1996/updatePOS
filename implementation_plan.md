# Modular Bill Printer Settings System - Implementation Plan

## 1. Data Schema Architecture
We will introduce a comprehensive `printerSettings` object within the global application state.

```json
{
  "billPrinter": {
    "profileName": "Main Thermal",
    "type": "thermal", // thermal, a4, network
    "paperWidth": "80mm", // 58mm, 80mm, a4
    "baudRate": 9600
  },
  "header": {
    "showLogo": true,
    "logoUrl": "", // Base64 or URL
    "logoSize": 60,
    "logoAlign": "center",
    "topText": "RESTAURANT NAME\nCity, Street\nGST: 27AAAAA0000A1Z5",
    "fontSize": 14,
    "fontWeight": "bold",
    "fontFamily": "monospace",
    "lineSpacing": 1.2,
    "marginTop": 10,
    "marginBottom": 10
  },
  "body": {
    "itemLayout": "grid", // standard, table, grid
    "columns": {
      "name": true,
      "qty": true,
      "price": true,
      "total": true
    },
    "itemNameSize": 12,
    "itemNameWeight": "bold",
    "itemPriceSize": 10,
    "separator": "dashed", // solid, dashed, none
    "showTaxDetails": true,
    "showCategory": false
  },
  "footer": {
    "bottomText": "Thank you for dining with us!\nVisit again.",
    "fontSize": 10,
    "fontWeight": "normal",
    "fontFamily": "monospace",
    "align": "center",
    "marginTop": 10,
    "marginBottom": 10
  },
  "advanced": {
    "margins": { "top": 5, "right": 5, "bottom": 5, "left": 5 },
    "showQRCode": true,
    "qrCodeType": "payment", // payment, website, order-id
    "showBarcode": false,
    "currencySymbol": "₹"
  }
}
```

## 2. Component Refactoring
- **`PrinterSettingsView`**: Rebuild this view as a multi-tab settings panel.
- **`BillPreview`**: A real-time preview component.
- **`EscPosGenerator`**: A utility class/function for ESC/POS conversion.

## 3. Implementation Steps
1.  **UI Foundation**: Extend `INITIAL_SETTINGS`.
2.  **Settings UI**: Header, Body, Footer controls.
3.  **Real-time Preview**: CSS-based virtual receipt.
4.  **Modern Printing Logic**: Refactor `printPosToSerial`.
5.  **Template Management**: Profile switcher.
