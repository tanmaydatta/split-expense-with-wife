package common

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/kofj/gorm-driver-d1/gormd1"
	"gorm.io/gorm"
)

type CurrentSession struct {
	Session   *Session
	User      *User
	Group     *Group
	UsersById map[int32]User
}

func Authenticate(request *http.Request) (bool, *CurrentSession) {
	cookie, err := request.Cookie("sessionid")
	if err != nil {
		return false, nil
	}
	return ValidateSession(cookie.Value)
}

func ValidateSession(sessionId string) (bool, *CurrentSession) {
	if sessionId == "" {
		return false, nil
	}
	fmt.Printf("sessionId: %s1\n", sessionId)
	session := Session{}
	// DSN_D1 environment variable should be set with the D1 connection string
	// e.g., "file:/mnt/d1/mydb.sqlite3" or the actual D1 binding
	dsn := os.Getenv("DSN_D1")
	if dsn == "" {
		log.Fatal("DSN_D1 environment variable not set")
		return false, nil
	}
	db, err := gorm.Open(gormd1.Open(dsn), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		log.Fatalf("failed to connect: %v", err)
		return false, nil
	}
	tx := db.Where("sessionid = ?", sessionId).First(&session)
	if tx.Error != nil {
		return false, nil
	}
	if session.ExpiryTime.Before(time.Now()) {
		return false, nil
	}
	// if username != "" && session.Username != username {
	// 	return false
	// }
	group := Group{}
	user := User{}
	tx = db.Select("id, username, first_name, groupid").Where("username = ?", session.Username).First(&user)
	if tx.Error != nil {
		return false, nil
	}
	tx = db.Select("groupid, budgets, userids, metadata").Where("groupid = ?", user.Groupid).First(&group)
	if tx.Error != nil {
		return false, nil
	}
	userIds := []int32{}
	err = json.Unmarshal([]byte(group.Userids), &userIds)
	if err != nil {
		return false, nil
	}
	users := []User{}
	tx = db.Select("id, username, first_name, groupid").Where("id in ?", userIds).Find(&users)
	if tx.Error != nil {
		return false, nil
	}
	usersById := map[int32]User{}
	for _, user := range users {
		usersById[user.Id] = user
	}
	fmt.Printf("session: %+v\n", session)
	fmt.Printf("user: %+v\n", user)
	fmt.Printf("group: %+v\n", group)
	return true, &CurrentSession{
		Session:   &session,
		User:      &user,
		Group:     &group,
		UsersById: usersById,
	}
}

func GenerateRandomID(length int) (string, error) {
	b := make([]byte, length)
	_, err := rand.Read(b)
	if err != nil {
		return "", err
	}
	id := base64.URLEncoding.EncodeToString(b)
	return id, nil
}
