import { inventoryRepository, type StockAdjustmentDto, type StockTransferDto } from "../repositories/inventoryRepository.ts";

export class InventoryService {
  /**
   * Get items list
   */
  async getItems(filter: { search?: string; type?: string; limit?: number }) {
    return inventoryRepository.getItems(filter);
  }

  /**
   * Create new item
   */
  async createItem(item: {
    item_code: string;
    name: string;
    type?: string;
    uom?: string;
    dimension?: string | null;
    spec?: string | null;
    unit_price?: number;
    lead_time_days?: number;
    initial_stock?: number;
  }) {
    return inventoryRepository.createItem(item);
  }

  /**
   * Execute stock adjustment with validation
   */
  async adjustStock(dto: StockAdjustmentDto, userEmail: string) {
    if (dto.quantity <= 0) {
      throw new Error("Kuantitas penyesuaian harus lebih dari 0.");
    }
    return inventoryRepository.adjustStock(dto, userEmail);
  }

  /**
   * Execute warehouse stock transfer with validation
   */
  async transferStock(dto: StockTransferDto, userEmail: string) {
    if (dto.quantity <= 0) {
      throw new Error("Kuantitas transfer harus lebih dari 0.");
    }
    if (dto.source_warehouse_id === dto.target_warehouse_id) {
      throw new Error("Gudang tujuan tidak boleh sama dengan gudang asal.");
    }
    return inventoryRepository.transferStock(dto, userEmail);
  }
}

export const inventoryService = new InventoryService();
