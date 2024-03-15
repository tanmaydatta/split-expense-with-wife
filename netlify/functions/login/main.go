package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/tanmaydatta/split-expense-with-wife/netlify/common"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type Metadata struct {
	DefaultShare    map[string]float64 `json:"defaultShare"`
	DefaultCurrency string             `json:"defaultCurrency"`
}

type Request struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type Response struct {
	Username string        `json:"username"`
	GroupId  int32         `json:"groupId"`
	Budgets  []string      `json:"budgets"`
	Users    []common.User `json:"users"`
	Userids  []int32       `json:"userids"`
	Metadata Metadata      `json:"metadata"`
	UserId   int32         `json:"userId"`
}

type User struct {
	common.User
	Password string
}

func handler(request events.APIGatewayProxyRequest) (*events.APIGatewayProxyResponse, error) {
	if request.HTTPMethod != "POST" {
		return &events.APIGatewayProxyResponse{
			StatusCode: 400,
		}, nil
	}
	var req = Request{}
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       fmt.Sprintf("Error parsing input, %v", err.Error()),
		}, nil
	}

	db, err := gorm.Open(postgres.Open(os.Getenv("DSN_POSTGRES")), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})

	if err != nil {
		log.Fatalf("failed to connect: %v", err)
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       "[budget] failed to connect to db",
		}, nil
	}
	user := User{}
	tx := db.Where("username = ?", req.Username).First(&user)
	if tx.Error != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 500,
			Body:       "[budget] error reading from db",
		}, nil
	}
	fmt.Printf("user: %+v\n", user)
	if user.Password != req.Password {
		return &events.APIGatewayProxyResponse{
			StatusCode: 401,
			Body:       "invalid credentials",
		}, nil
	}
	sessionId, err := common.GenerateRandomID(16)
	if err != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 500,
			Body:       "error generating session id",
		}, nil
	}

	group := common.Group{}
	tx = db.Where("groupid = ?", user.Groupid).First(&group)
	if tx.Error != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 500,
			Body:       "[budget] error reading from db",
		}, nil
	}
	fmt.Printf("group: %+v\n", string(group.Metadata))
	budgets := []string{}
	err = json.Unmarshal([]byte(group.Budgets), &budgets)
	if err != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 500,
			Body:       "[budget] error reading from db",
		}, nil
	}
	metadata := Metadata{}
	err = json.Unmarshal([]byte(group.Metadata), &metadata)
	if err != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 500,

			Body: "[budget] error reading from db",
		}, nil
	}

	userIds := []int32{}
	err = json.Unmarshal([]byte(group.Userids), &userIds)
	if err != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 500,
			Body:       "[budget] error reading from db",
		}, nil
	}
	users := []common.User{}
	tx = db.Where("id in ?", userIds).Find(&users)
	if tx.Error != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 500,
			Body:       "[budget] error reading from db",
		}, nil
	}

	expiration := time.Now().Add(24 * time.Hour)
	tx = db.Create(&common.Session{
		Username:   req.Username,
		Sessionid:  sessionId,
		ExpiryTime: expiration,
	})
	if tx.Error != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 500,
			Body:       "[budget] error writing in db",
		}, nil
	}

	sessionCookie := http.Cookie{
		Name:     "sessionid",
		Value:    sessionId,
		Expires:  expiration,
		HttpOnly: true,
		Path:     "/",
	}
	userFirstNames := []string{}
	for _, user := range users {
		userFirstNames = append(userFirstNames, user.FirstName)
	}
	b, _ := json.Marshal(Response{
		Username: req.Username,
		GroupId:  user.Groupid,
		Budgets:  budgets,
		Users:    users,
		Userids:  userIds,
		Metadata: metadata,
		UserId:   user.Id,
	})

	return &events.APIGatewayProxyResponse{
		StatusCode: 200,
		Body:       string(b),
		Headers: map[string]string{
			"Set-Cookie": sessionCookie.String(),
		},
	}, nil
}

func main() {
	lambda.Start(handler)
}
