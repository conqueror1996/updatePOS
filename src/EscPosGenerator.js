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
    const { header, meta, body, footer, advanced } = this.settings;
    let cmds = [this.CMD.INIT];
    const charLimit = this.charLimit;

    // --- Header Section ---
    if (header) {
      cmds.push(header.logoAlign === 'center' ? this.CMD.ALIGN_CENTER : header.logoAlign === 'right' ? this.CMD.ALIGN_RIGHT : this.CMD.ALIGN_LEFT);
      
      if (header.showStoreName) {
        cmds.push(this.CMD.BOLD_ON);
        cmds.push(this.t((header.storeName || 'Store Name') + '\n'));
        cmds.push(this.CMD.BOLD_OFF);
      }
      
      if (header.showAddress && header.storeAddress) {
        cmds.push(this.t(header.storeAddress + '\n'));
      }
      
      if (header.showPhone && header.storePhone) {
        cmds.push(this.t(`Ph: ${header.storePhone}\n`));
      }

      if (header.showTaxId && header.taxId) {
        cmds.push(this.t(`${header.taxId}\n`));
      }
      cmds.push(this.line('-'));
    }

    // --- Meta Section (Customer/Table info) ---
    cmds.push(this.CMD.ALIGN_LEFT);
    if (meta?.showCustomerName) {
      cmds.push(this.t(`Name: ${orderData.customerName || 'Walk-In'}\n`));
    }
    if (meta?.showCustomerPhone && orderData.customerPhone) {
        cmds.push(this.t(`Ph: ${orderData.customerPhone}\n`));
    }
    cmds.push(this.line('-'));

    const dateStr = new Date().toLocaleDateString('en-GB');
    const timeStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    
    const twoCol = (left, right) => {
      const spacing = charLimit - (left?.length || 0) - (right?.length || 0);
      return (left || "") + " ".repeat(Math.max(1, spacing)) + (right || "") + "\n";
    };

    let metaRow1L = meta?.showDateTime ? `Date: ${dateStr}` : "";
    let metaRow1R = meta?.showTableNo ? `${orderData.orderType || 'Table'}: ${orderData.tableName || 'N/A'}` : "";
    if (metaRow1L || metaRow1R) cmds.push(this.t(twoCol(metaRow1L, metaRow1R)));

    let metaRow2L = meta?.showDateTime ? timeStr : "";
    if (metaRow2L) cmds.push(this.t(`${metaRow2L}\n`));

    let metaRow3L = meta?.showCashierName ? `Cashier: ${orderData.cashierName || 'Staff'}` : "";
    let metaRow3R = meta?.showOrderId ? `Bill No: ${orderData.billNo || '0000'}` : "";
    if (metaRow3L || metaRow3R) cmds.push(this.t(twoCol(metaRow3L, metaRow3R)));
    
    cmds.push(this.line('-'));

    // --- Body Section (Items Table) ---
    const showQty = body?.showQty !== false;
    const showPrice = body?.showPrice !== false;
    const showTotal = body?.showTotal !== false;

    const priceW = showPrice ? (charLimit === 32 ? 7 : 10) : 0;
    const amountW = showTotal ? (charLimit === 32 ? 7 : 10) : 0;
    const qtyW = showQty ? (charLimit === 32 ? 4 : 6) : 0;
    const itemW = charLimit - qtyW - priceW - amountW;

    let tableHeader = "Item".padEnd(itemW);
    if (showQty) tableHeader += "Qty.".padStart(qtyW);
    if (showPrice) tableHeader += "Price".padStart(priceW);
    if (showTotal) tableHeader += "Amount".padStart(amountW);
    
    cmds.push(this.t(tableHeader + '\n'));
    cmds.push(this.line('-'));

    orderData.items.forEach(item => {
      let name = item.name;
      let firstLine = name.substring(0, itemW).padEnd(itemW);
      let row = firstLine;
      if (showQty) row += item.qty.toString().padStart(qtyW);
      if (showPrice) row += item.price.toFixed(2).padStart(priceW);
      if (showTotal) row += (item.qty * item.price).toFixed(2).padStart(amountW);

      if (body?.itemNameWeight === 'bold') cmds.push(this.CMD.BOLD_ON);
      cmds.push(this.t(row + '\n'));
      cmds.push(this.CMD.BOLD_OFF);
      
      if (name.length > itemW) {
        cmds.push(this.t(name.substring(itemW) + '\n'));
      }
    });
    cmds.push(this.line('-'));

    // --- Summary Section ---
    const totalQty = orderData.items.reduce((acc, i) => acc + i.qty, 0);
    const summaryCol = (left, mid, right) => {
      const rightPart = mid.padEnd(15) + right.padStart(10);
      const leftPart = left.padEnd(charLimit - rightPart.length);
      return leftPart + rightPart + "\n";
    };

    cmds.push(this.t(summaryCol(`Total Qty: ${totalQty}`, "Sub Total", orderData.subtotal?.toFixed(2))));
    
    if (orderData.serviceCharge > 0) {
      cmds.push(this.t(summaryCol("", "Service Charge", orderData.serviceCharge?.toFixed(2))));
    }

    if (orderData.roundOff !== 0) {
      const roStr = (orderData.roundOff > 0 ? "+" : "") + orderData.roundOff.toFixed(2);
      cmds.push(this.t(summaryCol("", "Round off", roStr)));
    }

    cmds.push(this.line('-'));
    
    cmds.push(this.CMD.BOLD_ON);
    const gtLabel = "Grand Total";
    const gtAmount = `₹${orderData.grandTotal?.toFixed(2)}`;
    const gtSpacing = charLimit - gtLabel.length - gtAmount.length;
    cmds.push(this.t(gtLabel + " ".repeat(Math.max(1, gtSpacing)) + gtAmount + '\n'));
    cmds.push(this.CMD.BOLD_OFF);
    cmds.push(this.line('-'));

    // --- Footer Section ---
    if (footer) {
      cmds.push(footer.align === 'center' ? this.CMD.ALIGN_CENTER : footer.align === 'right' ? this.CMD.ALIGN_RIGHT : this.CMD.ALIGN_LEFT);
      if (footer.bottomText) {
        cmds.push(this.t(footer.bottomText + '\n'));
      }
      if (footer.showWiFi && footer.wifiName) {
        cmds.push(this.t(`WiFi: ${footer.wifiName} / ${footer.wifiPass || ''}\n`));
      }
    }

    cmds.push(this.t('\n\n\n\n'));
    cmds.push(this.CMD.CUT);
    return this.combine(cmds);
  }

  generateKOT(orderData, stationName = null) {
    const { kot = {} } = this.settings;
    let cmds = [this.CMD.INIT];
    const charLimit = this.charLimit;

    cmds.push(this.CMD.ALIGN_CENTER);
    cmds.push(this.CMD.BOLD_ON);
    cmds.push(this.t(`${stationName || kot.title || 'KOT'}\n`));
    cmds.push(this.CMD.BOLD_OFF);
    cmds.push(this.line('='));
    
    cmds.push(this.CMD.ALIGN_LEFT);
    const dateStr = new Date().toLocaleDateString('en-GB');
    const timeStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    
    const twoCol = (left, right) => {
      const spacing = charLimit - (left?.length || 0) - (right?.length || 0);
      return (left || "") + " ".repeat(Math.max(1, spacing)) + (right || "") + "\n";
    };

    cmds.push(this.t(twoCol(`Table: ${orderData.tableName || 'N/A'}`, `Date: ${dateStr}`)));
    cmds.push(this.t(`Time: ${timeStr}\n`));
    if (kot.showOrderType && orderData.orderType) {
        cmds.push(this.t(`Type: ${orderData.orderType}\n`));
    }
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
