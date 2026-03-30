/**
 * ESC/POS Command Generator for thermal printers.
 * Supports customizable layouts based on the Bill Printer Settings System.
 */

export class EscPosGenerator {
  constructor(settings = {}) {
    this.settings = settings;
    this.encoder = new TextEncoder();
    
    // Printer Profiles & Paper Width
    const profileId = settings.selectedProfileId || 'default';
    this.profile = settings.printerProfiles?.find(p => p.id === profileId) || { paperWidth: '80mm' };
    this.charLimit = this.profile.paperWidth === '58mm' ? 32 : 48; // Standard character limits for 58mm vs 80mm
    
    // Command Constants
    this.CMD = {
      INIT: new Uint8Array([0x1B, 0x40]),
      BOLD_ON: new Uint8Array([0x1B, 0x45, 1]),
      BOLD_OFF: new Uint8Array([0x1B, 0x45, 0]),
      ALIGN_LEFT: new Uint8Array([0x1B, 0x61, 0]),
      ALIGN_CENTER: new Uint8Array([0x1B, 0x61, 1]),
      ALIGN_RIGHT: new Uint8Array([0x1B, 0x61, 2]),
      CUT: new Uint8Array([0x1D, 0x56, 0x41, 0x08]),
      FONT_NORMAL: new Uint8Array([0x1B, 0x21, 0]),
      FONT_LARGE: new Uint8Array([0x1B, 0x21, 0x30]), // Double width & height
      LINE_SPACING_DEFAULT: new Uint8Array([0x1B, 0x32]),
    };
  }

  // Helper to merge multiple Uint8Arrays
  combine(arrays) {
    let totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
    let result = new Uint8Array(totalLength);
    let offset = 0;
    for (let arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  }

  t(text) {
    return this.encoder.encode(text);
  }

  line(char = '-') {
    return this.t(char.repeat(this.charLimit) + "\n");
  }

  generateBill(orderData) {
    const { header, meta, body, footer } = this.settings;
    let cmds = [this.CMD.INIT];
    const charLimit = this.charLimit;

    // --- Header Section ---
    cmds.push(this.CMD.ALIGN_CENTER);
    if (header?.showStoreName) {
      cmds.push(this.CMD.BOLD_ON);
      cmds.push(this.t((header.storeName || 'Store Name') + "\n"));
      cmds.push(this.CMD.BOLD_OFF);
    }
    if (header?.showAddress && header.storeAddress) {
      cmds.push(this.t(header.storeAddress + "\n"));
    }
    cmds.push(this.CMD.ALIGN_LEFT);
    cmds.push(this.line('-'));

    // --- Customer Name Placeholder ---
    cmds.push(this.t("Name: " + "_".repeat(charLimit - 6) + "\n"));
    cmds.push(this.line('-'));

    // --- Meta Info ---
    const dateStr = new Date(orderData.timestamp || Date.now()).toLocaleDateString('en-GB');
    const timeStr = new Date(orderData.timestamp || Date.now()).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    
    const twoCol = (left, right, rightBold = false) => {
      const spacing = charLimit - (left?.length || 0) - (right?.length || 0);
      let r = (left || "") + " ".repeat(Math.max(1, spacing));
      return r;
    };

    // Row 1: Date | Dine In: Table
    const row1L = `Date: ${dateStr}`;
    const row1R = `${orderData.orderType || 'Dine In'}: ${orderData.tableName || orderData.tableId || 'N/A'}`;
    const r1Spacing = charLimit - row1L.length - row1R.length;
    cmds.push(this.t(row1L + " ".repeat(Math.max(1, r1Spacing))));
    cmds.push(this.CMD.BOLD_ON);
    cmds.push(this.t(row1R + "\n"));
    cmds.push(this.CMD.BOLD_OFF);

    // Row 2: Time
    cmds.push(this.t(timeStr + "\n"));

    // Row 3: Cashier | Bill No
    const row3L = `Cashier: ${orderData.cashierName || 'biller'}`;
    const row3R = `Bill No.: ${orderData.billNo || orderData.id || '0000'}`;
    const r3Spacing = charLimit - row3L.length - row3R.length;
    cmds.push(this.t(row3L + " ".repeat(Math.max(1, r3Spacing)) + row3R + "\n"));

    cmds.push(this.line('-'));

    // --- Body (Items) ---
    const qtyW = 4;
    const priceW = 8;
    const amountW = 9;
    const itemW = charLimit - qtyW - priceW - amountW;

    let tableHeader = "Item".padEnd(itemW) + "Qty".padStart(qtyW) + "Price".padStart(priceW) + "Amount".padStart(amountW);
    cmds.push(this.t(tableHeader + "\n"));
    cmds.push(this.line('-'));

    (orderData.items || orderData.cart || []).forEach(item => {
      let name = item.name;
      let firstLine = name.substring(0, itemW).padEnd(itemW);
      let row = firstLine + item.qty.toString().padStart(qtyW) + item.price.toFixed(2).padStart(priceW) + (item.qty * item.price).toFixed(2).padStart(amountW);
      cmds.push(this.t(row + "\n"));
      
      if (name.length > itemW) {
        cmds.push(this.t(name.substring(itemW) + "\n"));
      }
    });
    cmds.push(this.line('-'));

    // --- Summary ---
    const totalQty = (orderData.items || orderData.cart || []).reduce((acc, i) => acc + i.qty, 0);
    const subTotalVal = (orderData.subtotal || 0).toFixed(2);
    const qtyLabel = `Total Qty: ${totalQty}`;
    
    // Line 1: [Total Qty: 2] [Sub] [Value]
    const qLabelW = 20;
    const subLabel = "Sub";
    const subSpacing = charLimit - qLabelW - subTotalVal.length;
    cmds.push(this.t(qtyLabel.padEnd(qLabelW) + subLabel.padEnd(subSpacing) + subTotalVal + "\n"));
    
    // Line 2: [ ] [Total]
    cmds.push(this.t(" ".repeat(qLabelW) + "Total\n"));

    if (orderData.serviceCharge > 0) {
        const scLabel = "Service Charge";
        const scStr = orderData.serviceCharge.toFixed(2);
        const scSpacing = charLimit - qLabelW - scStr.length;
        cmds.push(this.t(scLabel.padStart(qLabelW + scLabel.length - qLabelW) + " ".repeat(subSpacing) + scStr + "\n"));
        cmds.push(this.t(" ".repeat(qLabelW - 8) + "(Optional)\n")); // Slightly indented under Service Charge
    }

    cmds.push(this.line('-'));

    if (orderData.roundOff !== 0) {
      const roLabel = "Round off";
      const roStr = (orderData.roundOff > 0 ? "+" : "") + orderData.roundOff.toFixed(2);
      const roSpacing = charLimit - roLabel.length - roStr.length;
      cmds.push(this.t(roLabel.padStart(charLimit - roStr.length) + roStr + "\n"));
    }

    // Grand Total
    cmds.push(this.CMD.BOLD_ON);
    const gtLabel = "Grand Total";
    const gtAmount = `₹${(orderData.grandTotal || 0).toFixed(2)}`;
    const gtSpacing = charLimit - gtLabel.length - gtAmount.length;
    cmds.push(this.t(gtLabel.padStart(charLimit - gtAmount.length) + gtAmount + "\n"));
    cmds.push(this.CMD.BOLD_OFF);
    cmds.push(this.line('-'));

    // --- Footer ---
    if (footer?.bottomText) {
      cmds.push(this.CMD.ALIGN_CENTER);
      cmds.push(this.t(footer.bottomText + "\n"));
    }

    cmds.push(this.t("\n\n\n\n"));
    cmds.push(this.CMD.CUT);
    return this.combine(cmds);
  }

  generateKOT(orderData, stationName = null) {
    let cmds = [this.CMD.INIT];
    const charLimit = this.charLimit;

    cmds.push(this.CMD.ALIGN_CENTER);
    cmds.push(this.t("Running Table\n"));
    
    const dateStr = new Date().toLocaleDateString('en-GB');
    const timeStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    cmds.push(this.t(`${dateStr} ${timeStr}\n`));
    
    cmds.push(this.t(`KOT - ${orderData.kotNo || orderData.id || '000'}\n`));
    
    cmds.push(this.CMD.BOLD_ON);
    cmds.push(this.t(`${orderData.orderType || 'Dine In'}\n`));
    cmds.push(this.t(`Table No: ${orderData.tableName || orderData.tableId || 'N/A'}\n`));
    cmds.push(this.CMD.BOLD_OFF);

    cmds.push(this.line('.')); // Dotted separator

    cmds.push(this.CMD.ALIGN_LEFT);
    const qtyW = 5;
    const noteW = Math.floor((charLimit - qtyW) * 0.4);
    const itemW = charLimit - qtyW - noteW;

    let header = "Item".padEnd(itemW) + "Special Note".padEnd(noteW) + "Qty".padStart(qtyW);
    cmds.push(this.t(header + "\n"));

    (orderData.items || orderData.cart || []).forEach(item => {
      cmds.push(this.CMD.BOLD_ON);
      let namePart = item.name.substring(0, itemW - 1).padEnd(itemW);
      cmds.push(this.t(namePart));
      cmds.push(this.CMD.BOLD_OFF);

      let notePart = (item.note || "--").substring(0, noteW - 1).padEnd(noteW);
      let qtyPart = item.qty.toString().padStart(qtyW);
      cmds.push(this.t(notePart + qtyPart + "\n"));

      if (item.name.length >= itemW) {
        cmds.push(this.t(item.name.substring(itemW - 1) + "\n"));
      }
    });

    cmds.push(this.line('.'));
    cmds.push(this.t("\n\n\n\n"));
    cmds.push(this.CMD.CUT);

    return this.combine(cmds);
  }
}
