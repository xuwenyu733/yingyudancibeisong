import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ParentUser, Unit, Word } from '../domain/types';
import { toPublicWord } from '../common/word';
import { DataStore } from '../store/data.store';

@Injectable()
export class TextbooksService {
  constructor(private readonly store: DataStore) {}

  async list(parent: ParentUser) {
    const member = await this.store.isActiveMember(parent.id);
    const textbooks = await this.store.listTextbooks();
    const units = await this.store.listUnits();
    const words = await this.store.listWords();

    return {
      items: textbooks.map((book) => ({
        ...book,
        units: units
          .filter((unit) => unit.textbookId === book.id)
          .map((unit) => this.toUnitView(unit, member, words)),
      })),
    };
  }

  async wordsOfUnit(parent: ParentUser, unitId: string) {
    const unit = await this.store.findUnit(unitId);
    if (!unit) throw new NotFoundException('单元不存在');

    const member = await this.store.isActiveMember(parent.id);
    if (!unit.free && !member) {
      throw new ForbiddenException('开通会员后解锁本单元');
    }

    const words = await this.store.listWords(unit.id);
    return {
      unit: this.toUnitView(unit, member, words),
      words: words.map((word) => toPublicWord(word)),
    };
  }

  private toUnitView(unit: Unit, member: boolean, words: Word[]) {
    return {
      id: unit.id,
      title: unit.title,
      order: unit.order,
      free: unit.free,
      locked: !unit.free && !member,
      wordCount: words.filter((word) => word.unitId === unit.id).length,
    };
  }
}
