import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { toPublicChild, ParentUser } from '../domain/types';
import { DataStore } from '../store/data.store';
import { CreateChildDto } from './dto/create-child.dto';

@Injectable()
export class ChildrenService {
  constructor(private readonly store: DataStore) {}

  async list(parent: ParentUser) {
    return {
      currentChildId: parent.currentChildId,
      items: (await this.store.listChildren(parent.id)).map(toPublicChild),
    };
  }

  async create(parent: ParentUser, dto: CreateChildDto) {
    const textbookId = await this.resolveTextbookId(dto.grade, dto.textbookId);
    const child = {
      id: randomUUID(),
      parentId: parent.id,
      nickname: dto.nickname.trim(),
      grade: dto.grade,
      textbookId,
      newWordsPerDay: 10,
      reviewLimitPerDay: 40,
    };
    await this.store.saveChild(child);
    parent.currentChildId = child.id;
    await this.store.saveParent(parent);
    return toPublicChild(child);
  }

  async select(parent: ParentUser, childId: string) {
    const child = await this.store.findChild(childId);
    if (!child || child.parentId !== parent.id) {
      throw new NotFoundException('找不到这个孩子档案');
    }
    parent.currentChildId = child.id;
    await this.store.saveParent(parent);
    return {
      currentChildId: child.id,
      child: toPublicChild(child),
    };
  }

  async updateTextbook(
    parent: ParentUser,
    childId: string,
    textbookId: string,
  ) {
    const child = await this.store.findChild(childId);
    if (!child || child.parentId !== parent.id) {
      throw new NotFoundException('找不到这个孩子档案');
    }
    const book = await this.store.findTextbook(textbookId);
    if (!book) throw new NotFoundException('教材不存在');
    if (book.grade !== child.grade) {
      throw new BadRequestException('教材年级与孩子档案不一致');
    }
    child.textbookId = book.id;
    await this.store.saveChild(child);
    return toPublicChild(child);
  }

  private async resolveTextbookId(grade: number, textbookId?: string) {
    const textbooks = await this.store.listTextbooks();
    if (textbookId) {
      const book = textbooks.find((item) => item.id === textbookId);
      if (!book) throw new NotFoundException('教材不存在');
      if (book.grade !== grade) {
        throw new BadRequestException('教材年级与所选年级不一致');
      }
      return book.id;
    }
    const preferred =
      textbooks.find(
        (item) => item.grade === grade && item.volume === '上册',
      ) ?? textbooks.find((item) => item.grade === grade);
    if (!preferred) {
      throw new BadRequestException('暂无该年级词库');
    }
    return preferred.id;
  }
}
