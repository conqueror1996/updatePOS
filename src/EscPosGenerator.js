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
    return this.t(char.repeat(this.charLimit) + '\n');
  }

  generateBill(orderData) {
    const { header, body, footer, advanced } = this.settings;
    let cmds = [this.CMD.INIT];

    // --- Header ---
    cmds.push(header.logoAlign === 'center' ? this.CMD.ALIGN_CENTER : header.logoAlign === 'right' ? this.CMD.ALIGN_RIGHT : this.CMD.ALIGN_LEFT);
    if (header.fontWeight === 'bold' || header.fontWeight === '900') cmds.push(this.CMD.BOLD_ON);
    
    // Top Text
    if (header.topText) {
      cmds.push(this.t(header.topText + '\n'));
    }
    cmds.push(this.CMD.BOLD_OFF);
    cmds.push(this.line(body.separator === 'dashed' ? '-' : body.separator === 'solid' ? '_' : ' '));

    // --- Meta Info ---
    cmds.push(this.CMD.ALIGN_LEFT);
    const dateStr = new Date().toLocaleDateString('en-GB');
    const timeStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    cmds.push(this.t(`Date: ${dateStr}   Time: ${timeStr}\n`));
    cmds.push(this.t(`Table: ${orderData.tableName || 'N/A'}\n`));
    if (orderData.customerName) cmds.push(this.t(`Customer: ${orderData.customerName}\n`));
    cmds.push(this.line(body.separator === 'dashed' ? '-' : body.separator === 'solid' ? '_' : ' '));

    // --- Body (Items) ---
    // Column calculations (simplified for 80mm/48chars or 58mm/32chars)
    // QTY(4) ITEM(REST) PRICE(8) TOTAL(8)
    const qtyW = body.showQty ? 4 : 0;
    const priceW = body.showPrice ? 8 : 0;
    const totalW = body.showTotal ? 9 : 0;
    const itemW = this.charLimit - qtyW - priceW - totalW;

    // Header
    let rowHeader = "";
    if (body.showQty) rowHeader += "QTY ".padEnd(qtyW);
    rowHeader += "ITEM".padEnd(itemW);
    if (body.showPrice) rowHeader += "PRICE ".padStart(priceW);
    if (body.showTotal) rowHeader += "TOTAL".padStart(totalW);
    cmds.push(this.CMD.BOLD_ON);
    cmds.push(this.t(rowHeader + '\n'));
    cmds.push(this.CMD.BOLD_OFF);
    cmds.push(this.line('-'));

    // Rows
    orderData.items.forEach(item => {
      let row = "";
      if (body.showQty) row += item.qty.toString().padEnd(qtyW);
      
      const itemName = item.name.substring(0, itemW - 1).padEnd(itemW);
      row += itemName;
      
      if (body.showPrice) row += item.price.toFixed(0).padStart(priceW);
      if (body.showTotal) row += (item.qty * item.price).toFixed(0).padStart(totalW);
      
      if (body.itemNameWeight === 'bold') cmds.push(this.CMD.BOLD_ON);
      cmds.push(this.t(row + '\n'));
      cmds.push(this.CMD.BOLD_OFF);
    });

    cmds.push(this.line(body.separator === 'dashed' ? '-' : body.separator === 'solid' ? '_' : ' '));

    // --- Summary ---
    cmds.push(this.CMD.ALIGN_RIGHT);
    cmds.push(this.t(`Subtotal: ${orderData.subtotal?.toFixed(2)}\n`));
    if (advanced.showTaxBreakdown) {
      const tax = (orderData.subtotal * 0.05).toFixed(2);
      cmds.push(this.t(`GST (5%): ${tax}\n`));
    }
    cmds.push(this.CMD.BOLD_ON);
    cmds.push(this.t(`GRAND TOTAL: Rs. ${orderData.grandTotal?.toFixed(2)}\n`));
    cmds.push(this.CMD.BOLD_OFF);

    // --- Footer ---
    cmds.push(this.CMD.ALIGN_CENTER);
    cmds.push(this.t('\n'));
    if (footer.bottomText) {
      cmds.push(this.t(footer.bottomText + '\n'));
    }

    // --- Cut ---
    cmds.push(this.t('\n\n\n\n'));
    cmds.push(this.CMD.CUT);

    return this.combine(cmds);
  }

  generateKOT(orderData, stationName = null) {
    let cmds = [this.CMD.INIT, this.CMD.ALIGN_CENTER, this.CMD.BOLD_ON];
    cmds.push(this.t(`KOT: ${stationName || 'Main Kitchen'}\n`));
    cmds.push(this.CMD.BOLD_OFF);
    cmds.push(this.line('='));
    
    cmds.push(this.CMD.ALIGN_LEFT);
    cmds.push(this.t(`Table: ${orderData.tableName}\n`));
    cmds.push(this.t(`Time: ${new Date().toLocaleTimeString()}\n`));
    cmds.push(this.line('-'));
    
    cmds.push(this.t("QTY  ITEM\n"));
    cmds.push(this.line('-'));
    
    orderData.items.forEach(item => {
      cmds.push(this.CMD.BOLD_ON);
      cmds.push(this.t(`${item.qty.toString().padEnd(5)}${item.name}\n`));
      cmds.push(this.CMD.BOLD_OFF);
      if (item.note) cmds.push(this.t(`  * NOTE: ${item.note}\n`));
    });
    
    cmds.push(this.line('='));
    cmds.push(this.t('\n\n\n\n'));
    cmds.push(this.CMD.CUT);
    
    return this.combine(cmds);
  }
}
