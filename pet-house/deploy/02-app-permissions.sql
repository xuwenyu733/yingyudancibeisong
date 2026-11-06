-- Official MySQL image creates this account first. Runtime only needs CRUD.
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'pet_room_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON pet_room.* TO 'pet_room_app'@'%';
